import crypto from 'node:crypto';
import {readJsonObject} from './http-body.js';
import PDFDocument from 'pdfkit';
const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const fail=(status,message)=>Object.assign(Error(message),{status});
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
export function depositRule(b){
 if(!uuid(b.productId)||!Number.isSafeInteger(b.amountCents)||b.amountCents<0||b.amountCents>1000000||!Number.isSafeInteger(b.units)||b.units<1||b.units>999||typeof b.label!=='string'||!b.label.trim()||b.label.length>80||/[\x00-\x1f]/.test(b.label)||![0,7,19].includes(b.taxRate))throw fail(400,'Artikel, Pfandbetrag, Gebindemenge, Bezeichnung und Steuersatz prüfen');
 return {productId:b.productId,amountCents:b.amountCents,units:b.units,label:b.label.trim(),taxRate:b.taxRate};
}
export function depositQuote(rules,items){return rules.filter(r=>items.some(i=>i.productId===r.product_id)).map(r=>{const qty=items.find(i=>i.productId===r.product_id).qty*r.units;const total=qty*r.amount_cents;if(!Number.isSafeInteger(qty)||qty<1||qty>9999999||!Number.isSafeInteger(total)||total>2147483647)throw fail(400,'Pfandmenge oder Betrag zu groß');return {productId:r.product_id,label:r.label,unitCents:r.amount_cents,taxRate:Number(r.tax_rate),qty,totalCents:total};});}
export async function migrateDeposit(db){await db.query(`
 CREATE TABLE IF NOT EXISTS pos_deposit_rules(product_id uuid PRIMARY KEY REFERENCES products(id),amount_cents int NOT NULL CHECK(amount_cents>0),units int NOT NULL CHECK(units BETWEEN 1 AND 999),label text NOT NULL,tax_rate numeric NOT NULL);
 CREATE TABLE IF NOT EXISTS pos_deposit_rule_changes(id bigserial PRIMARY KEY,product_id uuid NOT NULL REFERENCES products(id),actor_id uuid NOT NULL REFERENCES users(id),before_rule jsonb,after_rule jsonb,created_at timestamptz NOT NULL DEFAULT now());
 CREATE TABLE IF NOT EXISTS pos_deposit_lines(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),order_id uuid NOT NULL REFERENCES orders(id),product_id uuid NOT NULL REFERENCES products(id),label text NOT NULL,unit_cents int NOT NULL,tax_rate numeric NOT NULL,quantity int NOT NULL,returned_qty int NOT NULL DEFAULT 0 CHECK(returned_qty>=0 AND returned_qty<=quantity));
 CREATE TABLE IF NOT EXISTS pos_deposit_returns(id uuid PRIMARY KEY,restaurant_id uuid NOT NULL REFERENCES restaurants(id),request_key uuid NOT NULL,fingerprint text NOT NULL,number text NOT NULL,amount_cents int NOT NULL,lines jsonb NOT NULL,reason text NOT NULL,actor_id uuid NOT NULL REFERENCES users(id),session_id uuid REFERENCES pos_cash_sessions(id),credited_order_id uuid REFERENCES orders(id),created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(restaurant_id,request_key));
 ALTER TABLE pos_deposit_returns ADD COLUMN IF NOT EXISTS credited_order_id uuid REFERENCES orders(id);
 CREATE SEQUENCE IF NOT EXISTS deposit_return_number_seq;
 CREATE OR REPLACE FUNCTION pos_deposit_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.product_id IS NOT NULL THEN PERFORM id FROM products WHERE id=NEW.product_id FOR SHARE;END IF;
 IF NEW.product_id IS NOT NULL AND EXISTS(SELECT 1 FROM pos_deposit_rules WHERE product_id=NEW.product_id) AND coalesce(current_setting('bringness.deposit_checkout',true),'')<>'yes' THEN RAISE EXCEPTION 'Pfandartikel nur über die Online-POS-Kasse mit Pfandberechnung verkaufen';END IF;RETURN NEW;END $$;
 DROP TRIGGER IF EXISTS pos_deposit_guard_item ON order_items;
 CREATE TRIGGER pos_deposit_guard_item BEFORE INSERT ON order_items FOR EACH ROW EXECUTE FUNCTION pos_deposit_guard();
 `);}
export function createDepositHandler(pool,authenticate){return async(req,res)=>{
 const url=new URL(req.url,'http://local');if(!url.pathname.startsWith('/api/v1/deposit/'))return false;
 const send=(status,data)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(data));return true;};
 const u=await authenticate(req);if(!u)return send(401,{error:'Nicht angemeldet'});if(!['owner','admin','manager'].includes(u.role))return send(403,{error:'Kein Kassenzugang'});
 const pdf=url.pathname.match(/^\/api\/v1\/deposit\/returns\/([a-f0-9-]{36})\/pdf$/i);
 if(pdf&&req.method==='GET'){
  if(!uuid(pdf[1]))return send(404,{error:'Rücknahme nicht gefunden'});
  const row=(await pool.query('SELECT d.*,r.name FROM pos_deposit_returns d JOIN restaurants r ON r.id=d.restaurant_id WHERE d.id=$1 AND r.company_id=$2',[pdf[1],u.company_id])).rows[0];if(!row)return send(404,{error:'Rücknahme nicht gefunden'});
  res.writeHead(200,{'content-type':'application/pdf','cache-control':'no-store','content-disposition':'attachment; filename='+row.number+'.pdf'});const trade=row.lines.some(l=>l.receiptNumber.startsWith('HR-'));const doc=new PDFDocument(trade?{size:'A4',margin:48}:{size:[226.77,Math.max(560,250+row.lines.length*60)],margin:18});doc.pipe(res);doc.fontSize(18).text('Pfandrücknahme '+row.number);doc.fontSize(11).text(row.name).text(new Date(row.created_at).toLocaleString('de-DE',{timeZone:'Europe/Berlin'}));
  for(const l of row.lines)doc.moveDown().text(l.qty+' × '+l.label+' · '+(l.unitCents/100).toFixed(2)+' EUR · '+l.taxRate+' % MwSt. · Ursprungsbeleg '+l.receiptNumber);
  doc.moveDown().text((row.credited_order_id?'Verrechnet im Verkauf: ':'Barauszahlung: ')+(row.amount_cents/100).toFixed(2)+' EUR').text('Grund: '+row.reason).text('Nicht TSE-signiert. Rücknahmebeleg, keine neue Verkaufsrechnung.');doc.end();return true;
 }
 if(!['/api/v1/deposit/rules','/api/v1/deposit/returns'].includes(url.pathname))return send(404,{error:'Nicht gefunden'});
 let b;try{b=req.method==='GET'?{restaurantId:url.searchParams.get('restaurantId'),receiptNumber:url.searchParams.get('receiptNumber')}:await readJsonObject(req,{maxBytes:16384});if(!uuid(b.restaurantId))throw fail(400,'Betrieb erforderlich');}catch(e){return send(e.status||400,{error:e.message});}
 if(!(await pool.query('SELECT id FROM restaurants WHERE id=$1 AND company_id=$2',[b.restaurantId,u.company_id])).rows.length)return send(404,{error:'Betrieb nicht gefunden'});
 if(req.method==='GET'){
  if(url.pathname.endsWith('/rules'))return send(200,{rules:(await pool.query('SELECT d.* FROM pos_deposit_rules d JOIN products p ON p.id=d.product_id WHERE p.restaurant_id=$1 ORDER BY d.product_id',[b.restaurantId])).rows});
  if(b.receiptNumber){const lines=(await pool.query('SELECT d.*,rc.receipt_number FROM pos_deposit_lines d JOIN orders o ON o.id=d.order_id JOIN receipts rc ON rc.order_id=o.id WHERE o.restaurant_id=$1 AND rc.receipt_number=$2 ORDER BY d.id',[b.restaurantId,String(b.receiptNumber).slice(0,100)])).rows;return send(200,{lines});}
  return send(200,{returns:(await pool.query('SELECT * FROM pos_deposit_returns WHERE restaurant_id=$1 ORDER BY created_at DESC,id DESC LIMIT 100',[b.restaurantId])).rows});
 }
 if(url.pathname.endsWith('/rules')&&req.method==='PUT'){
  let rule;try{rule=depositRule(b)}catch(e){return send(400,{error:e.message});}
  if(!['owner','admin'].includes(u.role))return send(403,{error:'Nur Inhaber oder Administratoren dürfen Pfand konfigurieren'});
  const c=await pool.connect();try{await c.query('BEGIN');const actor=await authenticate(req,c,true);if(!actor||actor.id!==u.id||actor.company_id!==u.company_id||!['owner','admin'].includes(actor.role))throw fail(403,'Zugang abgelaufen');
   await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',[actor.company_id+':deposit-config']);
   const unlock=String(req.headers['x-personnel-unlock']||''),session=String(req.headers.authorization||'').replace(/^Bearer /,'');
   if(!unlock||!(await c.query('SELECT 1 FROM personnel_unlocks WHERE token_hash=$1 AND session_hash=$2 AND user_id=$3 AND expires_at>now() FOR SHARE',[hash(unlock),hash(session),u.id])).rows.length)throw fail(403,'Verwaltungs-PIN erforderlich');
   if(!(await c.query('SELECT p.id FROM products p JOIN restaurants r ON r.id=p.restaurant_id WHERE p.id=$1 AND p.restaurant_id=$2 AND r.company_id=$3 FOR UPDATE OF p,r',[rule.productId,b.restaurantId,actor.company_id])).rows.length)throw fail(404,'Artikel nicht gefunden');
   // Switching an already-issued offline catalog would otherwise undercharge a deposit.
   if(await c.query("SELECT to_regclass('pos_offline_catalogs') present").then(r=>r.rows[0]?.present)){const active=await c.query("SELECT 1 FROM pos_offline_catalogs WHERE company_id=$1 AND (payload->>'validUntil')::timestamptz>now() AND EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(payload->'products','[]'::jsonb)) p WHERE p->>'id'=$2) LIMIT 1",[u.company_id,rule.productId]);if(active.rows.length)throw fail(409,'Aktiven Offline-Katalog zuerst auslaufen lassen, bevor Pfand geändert wird');}
   const oldRule=(await c.query('SELECT * FROM pos_deposit_rules WHERE product_id=$1',[rule.productId])).rows[0]||null;
   if(!rule.amountCents)await c.query('DELETE FROM pos_deposit_rules WHERE product_id=$1',[rule.productId]);else await c.query('INSERT INTO pos_deposit_rules VALUES($1,$2,$3,$4,$5) ON CONFLICT(product_id) DO UPDATE SET amount_cents=$2,units=$3,label=$4,tax_rate=$5',[rule.productId,rule.amountCents,rule.units,rule.label,rule.taxRate]);
   await c.query('INSERT INTO pos_deposit_rule_changes(product_id,actor_id,before_rule,after_rule) VALUES($1,$2,$3,$4)',[rule.productId,actor.id,oldRule?JSON.stringify(oldRule):null,rule.amountCents?JSON.stringify(rule):null]);
   await c.query('COMMIT');return send(200,{ok:true});
  }catch(e){await c.query('ROLLBACK');if(e.status)return send(e.status,{error:e.message});throw e;}finally{c.release();}
 }
 if(!url.pathname.endsWith('/returns')||req.method!=='POST')return send(405,{error:'Methode nicht erlaubt'});
 if(!uuid(b.requestKey)||!Array.isArray(b.items)||!b.items.length||b.items.length>100||b.items.some(i=>!uuid(i.lineId)||!Number.isSafeInteger(i.qty)||i.qty<1||i.qty>9999999)||new Set(b.items.map(i=>i.lineId)).size!==b.items.length||typeof b.reason!=='string'||!b.reason.trim()||b.reason.length>300||/[\x00-\x1f\x7f]/.test(b.reason))return send(400,{error:'Rücknahmemenge, Vorgangskennung und Begründung erforderlich'});
 const items=b.items.map(i=>({lineId:i.lineId,qty:i.qty})).sort((a,b)=>a.lineId.localeCompare(b.lineId)),fingerprint=hash(JSON.stringify({items,reason:b.reason.trim()}));
 const c=await pool.connect();try{await c.query('BEGIN');const actor=await authenticate(req,c,true);if(!actor||actor.id!==u.id||actor.company_id!==u.company_id||!['owner','admin','manager'].includes(actor.role))throw fail(403,'Zugang abgelaufen');
  if(!(await c.query('SELECT id FROM restaurants WHERE id=$1 AND company_id=$2 FOR SHARE',[b.restaurantId,actor.company_id])).rows.length)throw fail(404,'Betrieb nicht gefunden');
  await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[b.restaurantId+':cash']);
  const old=(await c.query('SELECT * FROM pos_deposit_returns WHERE restaurant_id=$1 AND request_key=$2',[b.restaurantId,b.requestKey])).rows[0];if(old){if(old.fingerprint!==fingerprint)throw fail(409,'Vorgangskennung gehört zu anderen Rücknahmedaten');await c.query('COMMIT');return send(200,{return:old,replayed:true});}
  const lines=[];let total=0;
  for(const i of items){const l=(await c.query('SELECT d.*,rc.receipt_number FROM pos_deposit_lines d JOIN orders o ON o.id=d.order_id JOIN receipts rc ON rc.order_id=o.id WHERE d.id=$1 AND o.restaurant_id=$2 FOR UPDATE OF d',[i.lineId,b.restaurantId])).rows[0];if(!l||i.qty>l.quantity-l.returned_qty)throw fail(409,'Pfand bereits zurückgenommen oder Menge überschritten');total+=i.qty*l.unit_cents;lines.push({lineId:l.id,label:l.label,qty:i.qty,unitCents:l.unit_cents,taxRate:Number(l.tax_rate),receiptNumber:l.receipt_number});}
  if(!Number.isSafeInteger(total)||total<=0||total>100000000)throw fail(400,'Rücknahmebetrag ungültig');
  const session=(await c.query('SELECT * FROM pos_cash_sessions WHERE restaurant_id=$1 AND closed_at IS NULL FOR UPDATE',[b.restaurantId])).rows[0];if(!session)throw fail(409,'Für Barauszahlung zuerst Kassenschicht öffnen');
  const balance=(await c.query("SELECT $2::bigint+COALESCE((SELECT sum(p.amount_cents) FROM pos_cash_payments cp JOIN payments p ON p.id=cp.payment_id WHERE cp.session_id=$1 AND p.method='cash'),0)+COALESCE((SELECT sum(CASE WHEN action='deposit' THEN amount_cents ELSE -amount_cents END) FROM pos_cash_movements WHERE session_id=$1),0) balance",[session.id,session.opening_cents])).rows[0].balance;if(Number(balance)<total)throw fail(409,'Bargeldbestand reicht für die Rücknahme nicht');
  for(const l of lines)await c.query('UPDATE pos_deposit_lines SET returned_qty=returned_qty+$2 WHERE id=$1',[l.lineId,l.qty]);
  const id=crypto.randomUUID(),number='PF-R-'+String((await c.query("SELECT nextval('deposit_return_number_seq') n")).rows[0].n).padStart(8,'0');
  await c.query("INSERT INTO pos_cash_movements(id,session_id,action,amount_cents,reason,created_by) VALUES($1,$2,'withdraw',$3,$4,$5)",[id,session.id,total,'Pfandrücknahme '+number+' · '+b.reason.trim(),actor.id]);
  const result=(await c.query('INSERT INTO pos_deposit_returns(id,restaurant_id,request_key,fingerprint,number,amount_cents,lines,reason,actor_id,session_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *',[id,b.restaurantId,b.requestKey,fingerprint,number,total,JSON.stringify(lines),b.reason.trim(),actor.id,session.id])).rows[0];await c.query('COMMIT');return send(201,{return:result});
 }catch(e){await c.query('ROLLBACK');if(e.status)return send(e.status,{error:e.message});throw e;}finally{c.release();}
};}

export async function reserveDepositCredit(c,rid,items){
 await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[rid+':cash']);
 const lines=[];let total=0;for(const i of items){const l=(await c.query('SELECT d.*,rc.receipt_number FROM pos_deposit_lines d JOIN orders o ON o.id=d.order_id JOIN receipts rc ON rc.order_id=o.id WHERE d.id=$1 AND o.restaurant_id=$2 FOR UPDATE OF d',[i.lineId,rid])).rows[0];if(!l||i.qty>l.quantity-l.returned_qty)throw fail(409,'Pfand bereits zurückgenommen oder Menge überschritten');total+=i.qty*l.unit_cents;lines.push({lineId:l.id,label:l.label,qty:i.qty,unitCents:l.unit_cents,taxRate:Number(l.tax_rate),receiptNumber:l.receipt_number});}
 if(!Number.isSafeInteger(total)||total<=0||total>100000000)throw fail(400,'Rücknahmebetrag ungültig');for(const l of lines)await c.query('UPDATE pos_deposit_lines SET returned_qty=returned_qty+$2 WHERE id=$1',[l.lineId,l.qty]);return {lines,total};
}
