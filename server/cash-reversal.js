import crypto from 'node:crypto';
import {readJsonObject} from './http-body.js';
import {draftRequest} from './trade-cancellation-drafts.js';
import {receiptLines} from './receipt-lines.js';
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const fail=(status,message)=>{throw Object.assign(Error(message),{status});};
export async function migrateCashReversal(db){await db.query(`
 ALTER TABLE orders ADD COLUMN IF NOT EXISTS reversal_of_receipt uuid REFERENCES receipts(id);
 ALTER TABLE order_items ADD COLUMN IF NOT EXISTS fixed_net_cents int;
 CREATE TABLE IF NOT EXISTS pos_receipt_reversals(original_receipt_id uuid PRIMARY KEY REFERENCES receipts(id),company_id uuid NOT NULL REFERENCES companies(id),request_key uuid NOT NULL,fingerprint text NOT NULL,reversal_receipt_id uuid NOT NULL UNIQUE REFERENCES receipts(id),cash_movement_id uuid NOT NULL UNIQUE REFERENCES pos_cash_movements(id),reason text NOT NULL,actor_id uuid NOT NULL REFERENCES users(id),response jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(company_id,request_key));
 `);}
export function createCashReversal(pool){return async(req,res)=>{
 const m=new URL(req.url,'http://local').pathname.match(/^\/api\/v1\/receipts\/([0-9a-f-]{36})\/cash-reversal$/i);if(!m||req.method!=='POST')return false;
 const send=(s,b)=>{res.writeHead(s,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(b));return true;};let c;
 try{
 const session=String(req.headers.authorization||'').replace(/^Bearer /,'');if(!session)return send(401,{error:'Nicht angemeldet'});
 const body=await readJsonObject(req,{maxBytes:4096}),b=draftRequest(body);if(body.cashPayoutConfirmed!==true)fail(400,'Barauszahlung ausdrücklich bestätigen');
 c=await pool.connect();await c.query('BEGIN');
 const actor=(await c.query("SELECT u.id,u.company_id,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now() AND u.status='active' AND NOT coalesce(u.must_change_password,false) FOR SHARE OF u,s",[hash(session)])).rows[0];if(!actor)fail(401,'Nicht angemeldet');if(!['owner','admin'].includes(actor.role))fail(403,'Inhaberfreigabe erforderlich');
 const unlock=String(req.headers['x-personnel-unlock']||'');if(!unlock||!(await c.query('SELECT 1 FROM personnel_unlocks WHERE token_hash=$1 AND session_hash=$2 AND user_id=$3 AND expires_at>now() FOR SHARE',[hash(unlock),hash(session),actor.id])).rows.length)fail(403,'Verwaltungs-PIN erforderlich');
 const receipt=(await c.query('SELECT rc.*,o.id original_order_id,o.total_cents,o.restaurant_id,o.status,o.reversal_of_receipt FROM receipts rc JOIN orders o ON o.id=rc.order_id JOIN restaurants r ON r.id=o.restaurant_id WHERE rc.id=$1 AND r.company_id=$2 FOR UPDATE OF rc,o',[m[1],actor.company_id])).rows[0];if(!receipt)fail(404,'Beleg nicht gefunden');
 await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',[actor.company_id+':cash-reversal:'+b.requestKey]);
 const fingerprint=hash(JSON.stringify({receiptId:receipt.id,reason:b.reason}));
 const old=(await c.query('SELECT fingerprint,response FROM pos_receipt_reversals WHERE company_id=$1 AND request_key=$2',[actor.company_id,b.requestKey])).rows[0];if(old){if(old.fingerprint!==fingerprint)fail(409,'Kennung bereits anders verwendet');await c.query('COMMIT');return send(200,{...old.response,replayed:true});}
 if((await c.query('SELECT 1 FROM pos_receipt_reversals WHERE original_receipt_id=$1',[receipt.id])).rows.length)fail(409,'Beleg wurde bereits storniert');
 if(receipt.reversal_of_receipt||receipt.status!=='paid'||receipt.total_cents<=0||!['pending','prepared'].includes(receipt.fiscal_status)||receipt.tse_signature)fail(409,'Dieser Beleg benötigt einen gesonderten Anbieter-/Fiskalabgleich');
 if(receipt.tse_transaction_id){const tx=(await c.query('SELECT state FROM tse_transactions WHERE id=$1 FOR UPDATE',[receipt.tse_transaction_id])).rows[0];if(!tx||tx.state!=='prepared')fail(409,'TSE-Vorgang wurde bereits begonnen. Anbieterabgleich erforderlich');}
 const payments=(await c.query('SELECT method,amount_cents FROM payments WHERE order_id=$1 FOR UPDATE',[receipt.original_order_id])).rows;
 if(!payments.length||payments.some(p=>p.method!=='cash')||payments.reduce((s,p)=>s+Number(p.amount_cents),0)!==receipt.total_cents)fail(409,'Nur vollständig bestätigte Barzahlungen können bar erstattet werden');
 const deposits=(await c.query('SELECT * FROM pos_deposit_lines WHERE order_id=$1 FOR UPDATE',[receipt.original_order_id])).rows;
 if(deposits.some(d=>Number(d.returned_qty)>0)||(await c.query('SELECT 1 FROM pos_deposit_returns WHERE credited_order_id=$1 LIMIT 1',[receipt.original_order_id])).rows.length)fail(409,'Bereits verrechnetes oder zurückgenommenes Pfand zuerst abgleichen');
 const items=(await c.query('SELECT * FROM order_items WHERE order_id=$1 ORDER BY id FOR SHARE',[receipt.original_order_id])).rows;
 const rows=receiptLines(items,receipt.sale_adjustment);if(rows.reduce((s,l)=>s+l.grossCents,0)!==receipt.total_cents)fail(409,'Belegpositionen stimmen nicht mit dem Gesamtbetrag überein');
 await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[receipt.restaurant_id+':cash']);
 const cash=(await c.query('SELECT * FROM pos_cash_sessions WHERE restaurant_id=$1 AND closed_at IS NULL FOR UPDATE',[receipt.restaurant_id])).rows[0];if(!cash)fail(409,'Barkasse zuerst eröffnen');
 const funds=Number(cash.opening_cents)+Number((await c.query("SELECT coalesce(sum(p.amount_cents),0) n FROM pos_cash_payments cp JOIN payments p ON p.id=cp.payment_id WHERE cp.session_id=$1 AND p.method='cash'",[cash.id])).rows[0].n)+Number((await c.query("SELECT coalesce(sum(CASE WHEN action='deposit' THEN amount_cents ELSE -amount_cents END),0) n FROM pos_cash_movements WHERE session_id=$1",[cash.id])).rows[0].n);
 if(funds<receipt.total_cents)fail(409,'Barkassenbestand reicht für diese Auszahlung nicht aus');
 await c.query("SELECT set_config('bringness.cash_reversal','yes',true)");
 const order=(await c.query("INSERT INTO orders(restaurant_id,status,source,total_cents,closed_at,reversal_of_receipt) VALUES($1,'paid','pos_refund',$2,now(),$3) RETURNING id",[receipt.restaurant_id,-receipt.total_cents,receipt.id])).rows[0];
 for(const row of rows)await c.query('INSERT INTO order_items(order_id,product_name_snapshot,unit_price_cents,tax_rate_snapshot,quantity,fixed_net_cents) VALUES($1,$2,$3,$4,1,$5)',[order.id,'Storno: '+row.product_name_snapshot,-row.grossCents,row.tax_rate_snapshot,-row.netCents]);
 const trade=(await c.query('SELECT recipient FROM pos_trade_sales WHERE order_id=$1',[receipt.original_order_id])).rows[0];if(trade)await c.query('INSERT INTO pos_trade_sales(order_id,recipient) VALUES($1,$2::jsonb)',[order.id,JSON.stringify(trade.recipient)]);
 const number='ST-'+new Date().getUTCFullYear()+'-'+String((await c.query("SELECT nextval('receipt_number_seq') n")).rows[0].n).padStart(6,'0');
 const credit=(await c.query('INSERT INTO receipts(order_id,receipt_number,merchant_snapshot) VALUES($1,$2,$3::jsonb) RETURNING id',[order.id,number,JSON.stringify({...receipt.merchant_snapshot,reversal:{originalNumber:receipt.receipt_number,reason:b.reason,method:'cash',amountCents:receipt.total_cents}})])).rows[0];
 const movement=crypto.randomUUID();await c.query("INSERT INTO pos_cash_movements(id,session_id,action,amount_cents,reason,created_by) VALUES($1,$2,'withdraw',$3,$4,$5)",[movement,cash.id,receipt.total_cents,'Storno '+number+' / '+receipt.receipt_number+': '+b.reason,actor.id]);
 if(deposits.length){const amount=deposits.reduce((s,d)=>s+Number(d.unit_cents)*Number(d.quantity),0);await c.query('UPDATE pos_deposit_lines SET returned_qty=quantity WHERE order_id=$1',[receipt.original_order_id]);await c.query('INSERT INTO pos_deposit_returns(id,restaurant_id,request_key,fingerprint,number,amount_cents,lines,reason,actor_id,session_id) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10)',[crypto.randomUUID(),receipt.restaurant_id,b.requestKey,fingerprint,'PF-'+number,amount,JSON.stringify(deposits.map(d=>({lineId:d.id,label:d.label,qty:d.quantity,unitCents:d.unit_cents,taxRate:Number(d.tax_rate)}))),b.reason,actor.id,cash.id]);}
 if(receipt.tse_transaction_id)await c.query("UPDATE tse_transactions SET state='reversal_pending',error_code='CASH_REVERSAL_PROVIDER_REQUIRED',updated_at=now() WHERE id=$1 AND state='prepared'",[receipt.tse_transaction_id]);
 const result={requestKey:b.requestKey,originalReceiptId:receipt.id,receiptId:credit.id,receiptNumber:number,refundedCents:receipt.total_cents,method:'cash',stockReturned:false};
 await c.query('INSERT INTO pos_receipt_reversals(original_receipt_id,company_id,request_key,fingerprint,reversal_receipt_id,cash_movement_id,reason,actor_id,response) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)',[receipt.id,actor.company_id,b.requestKey,fingerprint,credit.id,movement,b.reason,actor.id,JSON.stringify(result)]);
 await c.query("INSERT INTO audit_log(company_id,actor_user_id,event_type,entity_type,entity_id,payload) VALUES($1,$2,'receipt.cash_reversal','receipt',$3,$4::jsonb)",[actor.company_id,actor.id,receipt.id,JSON.stringify(result)]);
 await c.query('COMMIT');return send(200,result);
 }catch(e){if(c)await c.query('ROLLBACK');return send(e.status||503,{error:e.status?e.message:'Stornostatus unklar. Dieselbe Kennung erneut abgleichen.'});}finally{c?.release();}
 };}
