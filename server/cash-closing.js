import crypto from 'node:crypto';
import {readJsonObject} from './http-body.js';
const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const fail=(status,message)=>Object.assign(Error(message),{status});
export function cashRequest(b){
 if(!uuid(b.restaurantId)||!uuid(b.requestKey)||!['open','deposit','withdraw','close'].includes(b.action))throw fail(400,'Betrieb, Vorgangskennung und Aktion erforderlich');
 if(!Number.isSafeInteger(b.amountCents)||b.amountCents<0||b.amountCents>100000000||(['deposit','withdraw'].includes(b.action)&&b.amountCents===0))throw fail(400,'Ungültiger Bargeldbetrag');
 const reason=b.reason??'';if(typeof reason!=='string'||reason.length>500||/[\x00-\x1f\x7f]/.test(reason)||(['deposit','withdraw'].includes(b.action)&&!reason.trim()))throw fail(400,'Begründung erforderlich (maximal 500 Zeichen)');
 if(b.action!=='open'&&!uuid(b.sessionId))throw fail(400,'Kassenschicht erforderlich');
 return {restaurantId:b.restaurantId,requestKey:b.requestKey,action:b.action,amountCents:b.amountCents,reason:reason.trim(),sessionId:b.action==='open'?null:b.sessionId};
}
export function cashTotals(opening,movements,payments){
 const cash=payments.filter(p=>p.method==='cash').reduce((s,p)=>s+Number(p.amount_cents),0);
 return {expectedCents:Number(opening)+cash+movements.reduce((s,m)=>s+(m.action==='deposit'?1:-1)*Number(m.amount_cents),0),payments:payments.map(p=>({...p,amount_cents:Number(p.amount_cents)}))};
}
export async function migrateCashClosing(db){await db.query(`
 CREATE TABLE IF NOT EXISTS pos_cash_sessions(id uuid PRIMARY KEY,restaurant_id uuid NOT NULL REFERENCES restaurants(id),opening_cents bigint NOT NULL CHECK(opening_cents>=0),opened_by uuid NOT NULL REFERENCES users(id),opened_at timestamptz NOT NULL DEFAULT clock_timestamp(),closed_at timestamptz,report jsonb);
 CREATE UNIQUE INDEX IF NOT EXISTS pos_cash_one_open ON pos_cash_sessions(restaurant_id) WHERE closed_at IS NULL;
 CREATE TABLE IF NOT EXISTS pos_cash_movements(id uuid PRIMARY KEY,session_id uuid NOT NULL REFERENCES pos_cash_sessions(id),action text NOT NULL CHECK(action IN ('deposit','withdraw')),amount_cents bigint NOT NULL CHECK(amount_cents>0),reason text NOT NULL,created_by uuid NOT NULL REFERENCES users(id),created_at timestamptz NOT NULL DEFAULT clock_timestamp());
 CREATE TABLE IF NOT EXISTS pos_cash_requests(restaurant_id uuid NOT NULL REFERENCES restaurants(id),request_key uuid NOT NULL,fingerprint text NOT NULL,response jsonb NOT NULL,PRIMARY KEY(restaurant_id,request_key));
 CREATE TABLE IF NOT EXISTS pos_cash_payments(payment_id uuid PRIMARY KEY REFERENCES payments(id),session_id uuid NOT NULL REFERENCES pos_cash_sessions(id));
 CREATE OR REPLACE FUNCTION pos_cash_capture() RETURNS trigger LANGUAGE plpgsql AS $$
 DECLARE rid uuid; sid uuid;
 BEGIN
 SELECT restaurant_id INTO rid FROM orders WHERE id=NEW.order_id;
 PERFORM pg_advisory_xact_lock(hashtextextended(rid::text||':cash',0));
 SELECT id INTO sid FROM pos_cash_sessions WHERE restaurant_id=rid AND closed_at IS NULL;
 IF sid IS NOT NULL THEN INSERT INTO pos_cash_payments(payment_id,session_id) VALUES(NEW.id,sid); END IF;
 RETURN NEW;
 END $$;
 DROP TRIGGER IF EXISTS pos_cash_capture_payment ON payments;
 CREATE TRIGGER pos_cash_capture_payment AFTER INSERT ON payments FOR EACH ROW EXECUTE FUNCTION pos_cash_capture();
 `);}
export function createCashClosing(pool,authenticate){return async(req,res)=>{
 const url=new URL(req.url,'http://local');if(url.pathname!=='/api/v1/cash-sessions')return false;
 const send=(status,data)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(data));return true;};
 const user=await authenticate(req);if(!user)return send(401,{error:'Nicht angemeldet'});if(!['owner','admin','manager'].includes(user.role))return send(403,{error:'Kein Verwaltungszugang'});
 if(!['GET','POST'].includes(req.method))return send(405,{error:'Methode nicht erlaubt'});
 let b;try{b=req.method==='GET'?{restaurantId:url.searchParams.get('restaurantId')}:cashRequest(await readJsonObject(req,{maxBytes:8192}));if(!uuid(b.restaurantId))throw fail(400,'Betrieb erforderlich');}catch(e){return send(e.status||400,{error:e.message});}
 const c=await pool.connect();try{
 await c.query('BEGIN');const actor=await authenticate(req,c,true);if(!actor||actor.id!==user.id||actor.company_id!==user.company_id||!['owner','admin','manager'].includes(actor.role))throw fail(403,'Zugang nicht mehr aktiv');
 if(!(await c.query('SELECT id FROM restaurants WHERE id=$1 AND company_id=$2',[b.restaurantId,actor.company_id])).rows.length)throw fail(404,'Betrieb nicht gefunden');
 await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[b.restaurantId+':cash']);
 const details=async session=>{const movements=(await c.query('SELECT * FROM pos_cash_movements WHERE session_id=$1 ORDER BY created_at,id',[session.id])).rows;const payments=(await c.query("SELECT p.method,CASE WHEN t.order_id IS NULL THEN 'retail' ELSE 'trade' END mode,sum(p.amount_cents)::text amount_cents FROM pos_cash_payments cp JOIN payments p ON p.id=cp.payment_id LEFT JOIN pos_trade_sales t ON t.order_id=p.order_id WHERE cp.session_id=$1 GROUP BY p.method,t.order_id IS NULL ORDER BY 1,2",[session.id])).rows;let deposit={chargedCents:0,returnedCents:0};if((await c.query("SELECT to_regclass('pos_deposit_lines') present")).rows[0]?.present){deposit.chargedCents=Number((await c.query('SELECT coalesce(sum(d.unit_cents*d.quantity),0) n FROM pos_deposit_lines d WHERE EXISTS(SELECT 1 FROM pos_cash_payments cp JOIN payments p ON p.id=cp.payment_id WHERE cp.session_id=$1 AND p.order_id=d.order_id)',[session.id])).rows[0].n);deposit.returnedCents=Number((await c.query('SELECT coalesce(sum(amount_cents),0) n FROM pos_deposit_returns d WHERE d.session_id=$1 OR EXISTS(SELECT 1 FROM pos_cash_payments cp JOIN payments p ON p.id=cp.payment_id WHERE cp.session_id=$1 AND p.order_id=d.credited_order_id)',[session.id])).rows[0].n);}return {...session,movements,deposit,...cashTotals(session.opening_cents,movements,payments)};};
 let result;
 if(req.method==='GET'){
 const sessions=(await c.query('SELECT * FROM pos_cash_sessions WHERE restaurant_id=$1 ORDER BY opened_at DESC,id DESC LIMIT 100',[b.restaurantId])).rows;
 result={sessions:await Promise.all(sessions.map(s=>s.report?Promise.resolve({...s.report,...s}):details(s)))};
 }else{
 const fingerprint=crypto.createHash('sha256').update(JSON.stringify(b)).digest('hex');
 const old=(await c.query('SELECT * FROM pos_cash_requests WHERE restaurant_id=$1 AND request_key=$2',[b.restaurantId,b.requestKey])).rows[0];
 if(old){if(old.fingerprint!==fingerprint)throw fail(409,'Vorgangskennung bereits mit anderen Daten verwendet');result=old.response;}
 else{
 if(b.action==='open'){
 if((await c.query('SELECT id FROM pos_cash_sessions WHERE restaurant_id=$1 AND closed_at IS NULL',[b.restaurantId])).rows.length)throw fail(409,'Eine Kassenschicht ist bereits geöffnet');
 result={session:(await c.query('INSERT INTO pos_cash_sessions(id,restaurant_id,opening_cents,opened_by) VALUES($1,$2,$3,$4) RETURNING *',[crypto.randomUUID(),b.restaurantId,b.amountCents,actor.id])).rows[0]};
 }else{
 const session=(await c.query('SELECT * FROM pos_cash_sessions WHERE id=$1 AND restaurant_id=$2 FOR UPDATE',[b.sessionId,b.restaurantId])).rows[0];
 if(!session||session.closed_at)throw fail(409,'Kassenschicht ist nicht geöffnet');
 if(b.action==='close'){
 const report={...await details(session),countedCents:b.amountCents,closedBy:actor.id,reason:b.reason};report.differenceCents=b.amountCents-report.expectedCents;
 if(report.differenceCents!==0&&!b.reason)throw fail(400,'Bitte Kassendifferenz begründen');
 const closed=(await c.query('UPDATE pos_cash_sessions SET closed_at=clock_timestamp(),report=$2 WHERE id=$1 RETURNING closed_at',[session.id,report])).rows[0];result={session:{...report,...closed}};
 }else{
 const current=await details(session);if(b.action==='withdraw'&&b.amountCents>current.expectedCents)throw fail(409,'Entnahme übersteigt den rechnerischen Bargeldbestand');
 await c.query('INSERT INTO pos_cash_movements(id,session_id,action,amount_cents,reason,created_by) VALUES($1,$2,$3,$4,$5,$6)',[crypto.randomUUID(),session.id,b.action,b.amountCents,b.reason,actor.id]);result={session:await details(session)};
 }
 }
 await c.query('INSERT INTO pos_cash_requests VALUES($1,$2,$3,$4)',[b.restaurantId,b.requestKey,fingerprint,result]);
 }
 }
 await c.query('COMMIT');return send(200,result);
 }catch(e){await c.query('ROLLBACK');if(e.status)return send(e.status,{error:e.message});throw e;}finally{c.release();}
 };}
