import crypto from 'node:crypto';
const fail=(message,status=409)=>{throw Object.assign(new Error(message),{status})};
const uuid=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
export async function migratePosStockBridge(pool){await pool.query(`
ALTER TABLE orders ADD COLUMN IF NOT EXISTS qr_ready_at timestamptz;
ALTER TABLE products ADD COLUMN IF NOT EXISTS ai_stock_available boolean NOT NULL DEFAULT true;
CREATE TABLE IF NOT EXISTS pos_stock_links(restaurant_id uuid PRIMARY KEY REFERENCES restaurants(id),connector_id uuid NOT NULL UNIQUE,account_id uuid NOT NULL,company_id uuid NOT NULL,active boolean NOT NULL DEFAULT false,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS pos_stock_commands(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),order_id uuid NOT NULL REFERENCES orders(id),connector_id uuid NOT NULL,account_id uuid NOT NULL,actor_id uuid NOT NULL,action text NOT NULL CHECK(action IN ('accept','start','cancel')),target_status text NOT NULL,items jsonb NOT NULL,reason text NOT NULL DEFAULT '',state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','applied','rejected')),error text,attempts int NOT NULL DEFAULT 0,created_at timestamptz NOT NULL DEFAULT now(),applied_at timestamptz);
CREATE UNIQUE INDEX IF NOT EXISTS pos_stock_pending ON pos_stock_commands(order_id) WHERE state='pending';
CREATE INDEX IF NOT EXISTS pos_stock_queue ON pos_stock_commands(created_at,id) WHERE state='pending';
CREATE OR REPLACE FUNCTION pos_stock_order_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM pos_stock_links WHERE restaurant_id=NEW.restaurant_id AND active) THEN
  IF TG_OP='INSERT' AND NEW.status<>'open' AND NOT (NEW.source='offline' AND NEW.status='paid' AND coalesce(current_setting('bringness.offline_import',true),'')='true') AND NOT (NEW.source='center' AND NEW.status='payment_pending') THEN RAISE EXCEPTION 'Lagerablauf: Bestellung zuerst anlegen, annehmen und Zubereitung starten'; END IF;
  IF TG_OP='UPDATE' THEN
   IF EXISTS(SELECT 1 FROM pos_stock_commands WHERE order_id=OLD.id AND state='pending') THEN RAISE EXCEPTION 'Lagerbuchung wird noch geprüft'; END IF;
   IF NEW.status<>OLD.status AND (NEW.status IN ('kitchen','preparing') OR NEW.status='cancelled' AND OLD.status<>'open') AND NOT EXISTS(SELECT 1 FROM pos_stock_commands WHERE order_id=OLD.id AND target_status=NEW.status AND state='applied') THEN RAISE EXCEPTION 'Status nur über den bestätigten Lagerablauf ändern'; END IF;
   IF NEW.qr_ready_at IS DISTINCT FROM OLD.qr_ready_at AND OLD.status IN ('open','kitchen') THEN RAISE EXCEPTION 'Zuerst Annahme und Zubereitungsstart bestätigen'; END IF;
   IF NEW.status='paid' AND OLD.status IN ('open','kitchen') THEN RAISE EXCEPTION 'Zubereitungsstart zuerst bestätigen'; END IF;
   IF NEW.restaurant_id<>OLD.restaurant_id THEN RAISE EXCEPTION 'Lagerbestellung darf den Betrieb nicht wechseln'; END IF;
  END IF;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS pos_stock_order_guard ON orders;
CREATE TRIGGER pos_stock_order_guard BEFORE INSERT OR UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION pos_stock_order_guard();
CREATE OR REPLACE FUNCTION pos_stock_item_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE oid uuid;
BEGIN
 oid=CASE WHEN TG_OP='DELETE' THEN OLD.order_id ELSE NEW.order_id END;
 PERFORM id FROM orders WHERE id=oid FOR UPDATE;
 IF EXISTS(SELECT 1 FROM pos_stock_commands WHERE order_id=oid AND (state='pending' OR state='applied' AND action='accept')) THEN RAISE EXCEPTION 'Angenommene Lagerbestellung nicht ändern; bei Bedarf stornieren und neu erfassen'; END IF;
 IF TG_OP='UPDATE' AND NEW.order_id<>OLD.order_id AND EXISTS(SELECT 1 FROM pos_stock_commands WHERE order_id=OLD.order_id AND state IN ('pending','applied')) THEN RAISE EXCEPTION 'Bestellposition darf den Auftrag nicht wechseln'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS pos_stock_item_guard ON order_items;
CREATE TRIGGER pos_stock_item_guard BEFORE INSERT OR UPDATE OR DELETE ON order_items FOR EACH ROW EXECUTE FUNCTION pos_stock_item_guard();
`)}
export async function configurePosStockLink(pool,link,active){
 const c=await pool.connect();try{await c.query('BEGIN');
 const restaurant=(await c.query('SELECT id FROM restaurants WHERE id=$1 AND company_id=$2 FOR UPDATE',[link.pos_restaurant_id,link.pos_company_id])).rows[0];if(!restaurant)fail('Kassenbetrieb nicht freigegeben',403);
 const old=(await c.query('SELECT * FROM pos_stock_links WHERE restaurant_id=$1 FOR UPDATE',[restaurant.id])).rows[0];
 if(old?.active&&old.connector_id!==link.id)fail('Kasse hat bereits einen Lagerablauf');
 if(old&&old.connector_id!==link.id&&(await c.query("SELECT 1 FROM pos_stock_commands WHERE connector_id=$1 LIMIT 1",[old.connector_id])).rowCount)fail('Vorhandene Lagerhistorie benötigt dieselbe Verbindung');
 if(old?.active!==active&&(await c.query("SELECT 1 FROM orders WHERE restaurant_id=$1 AND status NOT IN ('paid','cancelled') LIMIT 1",[restaurant.id])).rowCount)fail('Offene Kassenbestellungen zuerst abschließen');
 await c.query('INSERT INTO pos_stock_links(restaurant_id,connector_id,account_id,company_id,active) VALUES($1,$2,$3,$4,$5) ON CONFLICT(restaurant_id) DO UPDATE SET connector_id=EXCLUDED.connector_id,account_id=EXCLUDED.account_id,company_id=EXCLUDED.company_id,active=EXCLUDED.active',[restaurant.id,link.id,link.account_id,link.pos_company_id,active]);if(!active)await c.query('UPDATE products SET ai_stock_available=true WHERE restaurant_id=$1',[restaurant.id]);await c.query('COMMIT');
 }catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}
}
export async function requestPosStockAction(pool,actor,orderId,b){
 if(!uuid.test(String(orderId)))fail('Bestellung nicht gefunden',404);
 const action={kitchen:'accept',preparing:'start',cancelled:'cancel'}[b.status];if(!action)fail('Ungültiger Bestellstatus',400);
 if(!['owner','admin','manager','kitchen','waiter'].includes(actor.role))fail('Kein Zugriff auf Küchenbestellungen',403);
 const reason=String(b.reason||'').trim();if(action==='cancel'&&(!reason||reason.length>500))fail('Stornogrund erforderlich',400);
 const c=await pool.connect();try{await c.query('BEGIN');
 const o=(await c.query('SELECT o.* FROM orders o JOIN restaurants r ON r.id=o.restaurant_id WHERE o.id=$1 AND r.company_id=$2 FOR UPDATE OF o',[orderId,actor.company_id])).rows[0];if(!o)fail('Bestellung nicht gefunden',404);
 if(actor.role==='waiter'&&!(await c.query("SELECT 1 FROM dining_tables t JOIN employees e ON e.id=t.waiter_employee_id WHERE t.id=$1 AND e.user_id=$2 AND e.active AND e.restaurant_id=$3",[o.table_id,actor.id,o.restaurant_id])).rowCount)fail('Tisch nicht zugeordnet',403);
 const pending=(await c.query("SELECT * FROM pos_stock_commands WHERE order_id=$1 AND state='pending'",[o.id])).rows[0];if(pending){if(pending.action!==action||pending.reason!==reason)fail('Eine andere Lagerbuchung läuft bereits');await c.query('COMMIT');return {pending:true,commandId:pending.id}}
 if(o.status===b.status){await c.query('COMMIT');return {id:o.id,status:o.status}}
 if(action==='accept'&&o.status!=='open'||action==='start'&&o.status!=='kitchen'||action==='cancel'&&['paid','cancelled'].includes(o.status))fail('Bestellstatus erlaubt diese Aktion nicht');
 const link=(await c.query('SELECT * FROM pos_stock_links WHERE restaurant_id=$1 AND active FOR SHARE',[o.restaurant_id])).rows[0];
 if(!link||(action==='cancel'&&o.status==='open')){
  await c.query("UPDATE orders SET status=$2,closed_at=CASE WHEN $2='cancelled' THEN now() ELSE closed_at END WHERE id=$1",[o.id,b.status]);await c.query('COMMIT');return {id:o.id,status:b.status};
 }
 const items=(await c.query('SELECT product_id,quantity FROM order_items WHERE order_id=$1 AND quantity>0 ORDER BY product_id',[o.id])).rows.map(i=>({productCode:String(i.product_id||''),quantity:Number(i.quantity)}));if(!items.length)fail('Keine Bestellpositionen');
 const command=(await c.query('INSERT INTO pos_stock_commands(order_id,connector_id,account_id,actor_id,action,target_status,items,reason) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8) RETURNING id',[o.id,link.connector_id,link.account_id,actor.id,action,b.status,JSON.stringify(items),reason])).rows[0];await c.query('COMMIT');return {pending:true,commandId:command.id};
 }catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}
}
// POS command remains durable if AI committed but the POS acknowledgement failed.
// The same UUID is replayed into the AI ledger after restart, with no second debit.
export async function processPosStockCommands(posPool,stockPool,kitchenAction,{limit=100}={}){
 const commands=(await posPool.query("SELECT id,order_id FROM pos_stock_commands WHERE state='pending' ORDER BY created_at,id LIMIT $1",[limit])).rows;
 for(const candidate of commands){const c=await posPool.connect();try{await c.query('BEGIN');
 const o=(await c.query('SELECT * FROM orders WHERE id=$1 FOR UPDATE',[candidate.order_id])).rows[0];
 const cmd=(await c.query("SELECT * FROM pos_stock_commands WHERE id=$1 AND state='pending' FOR UPDATE",[candidate.id])).rows[0];if(!cmd){await c.query('ROLLBACK');continue}
 const link=(await stockPool.query("SELECT c.* FROM ai_connectors c JOIN ai_accounts a ON a.id=c.account_id WHERE c.id=$1 AND c.account_id=$2 AND c.pos_restaurant_id=$3 AND c.kind='pos' AND c.consumption_mode='lifecycle' AND c.active AND a.status='active'",[cmd.connector_id,cmd.account_id,o.restaurant_id])).rows[0];
 if(!link)fail('Lageranbindung nicht aktiv',503);
 if(!(await c.query("SELECT 1 FROM users u WHERE u.id=$1 AND u.company_id=$2 AND u.status='active' AND u.role IN ('owner','admin') AND NOT coalesce(u.must_change_password,false)",[link.pos_user_id,link.pos_company_id])).rowCount)fail('Inhaberfreigabe der Kasse nicht mehr gültig',503);
 try{await kitchenAction(stockPool,{id:link.account_id,role:'restaurant'},{requestKey:cmd.id,orderId:'pos:'+o.id,action:cmd.action,...(cmd.action==='accept'?{items:cmd.items}:{}),reason:cmd.reason},link)}catch(e){
  if(e.status>=400&&e.status<500){await c.query("UPDATE pos_stock_commands SET state='rejected',error=$2,attempts=attempts+1 WHERE id=$1",[cmd.id,String(e.message).slice(0,500)]);await c.query('COMMIT');continue}throw e;
 }
 await c.query("UPDATE pos_stock_commands SET state='applied',error=NULL,attempts=attempts+1,applied_at=now() WHERE id=$1",[cmd.id]);
 await c.query("UPDATE orders SET status=$2,closed_at=CASE WHEN $2='cancelled' THEN now() ELSE closed_at END WHERE id=$1",[o.id,cmd.target_status]);await c.query('COMMIT');
 await stockPool.query('UPDATE ai_connectors SET last_sync=now(),last_error=NULL WHERE id=$1',[link.id]);
 }catch(e){await c.query('ROLLBACK');await posPool.query("UPDATE pos_stock_commands SET attempts=attempts+1,error=$2 WHERE id=$1 AND state='pending'",[candidate.id,String(e.message).slice(0,500)])}finally{c.release()}}
}
export async function syncPosStockAvailability(posPool,stockPool,recipeAvailability){
 const links=(await stockPool.query("SELECT c.* FROM ai_connectors c JOIN ai_accounts a ON a.id=c.account_id WHERE c.kind='pos' AND c.consumption_mode='lifecycle' AND c.active AND a.status='active'")).rows;
 for(const link of links){const available=(await recipeAvailability(stockPool,link.account_id,link.location_id)).filter(r=>r.available).map(r=>r.external_code);await posPool.query('UPDATE products p SET ai_stock_available=(p.id::text=ANY($2::text[])) WHERE p.restaurant_id=$1 AND EXISTS(SELECT 1 FROM pos_stock_links l WHERE l.restaurant_id=p.restaurant_id AND l.connector_id=$3 AND l.active)',[link.pos_restaurant_id,available,link.id])}
}
export function createPosStockHandler(pool){
 const send=(res,status,value)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(value));return true};
 return async(req,res)=>{
 const p=new URL(req.url,'http://local').pathname;
 const action=p.match(/^\/api\/v1\/orders\/([0-9a-f-]{36})\/status$/i),poll=p.match(/^\/api\/v1\/stock-commands\/([0-9a-f-]{36})$/i);
 if(!action&&!poll)return false;
 if(action&&req.method!=='PATCH'||poll&&req.method!=='GET')return send(res,405,{error:'Methode nicht erlaubt'});
 const token=String(req.headers.authorization||'').replace(/^Bearer\s+/i,''),actor=(await pool.query("SELECT u.id,u.company_id,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now() AND u.status='active' AND NOT coalesce(u.must_change_password,false)",[crypto.createHash('sha256').update(token).digest('hex')])).rows[0];if(!actor)return send(res,401,{error:'Nicht angemeldet'});
 try{
 if(poll){const q=await pool.query('SELECT cmd.id,cmd.state,cmd.error,o.id order_id,o.status,o.table_id,o.restaurant_id FROM pos_stock_commands cmd JOIN orders o ON o.id=cmd.order_id JOIN restaurants r ON r.id=o.restaurant_id WHERE cmd.id=$1 AND r.company_id=$2',[poll[1],actor.company_id]);if(!q.rowCount)return send(res,404,{error:'Lagerbuchung nicht gefunden'});const r=q.rows[0];if(!['owner','admin','manager','kitchen'].includes(actor.role)&&!(actor.role==='waiter'&&(await pool.query('SELECT 1 FROM dining_tables t JOIN employees e ON e.id=t.waiter_employee_id WHERE t.id=$1 AND e.user_id=$2 AND e.active AND e.restaurant_id=$3',[r.table_id,actor.id,r.restaurant_id])).rowCount))return send(res,403,{error:'Kein Zugriff auf Lagerbuchung'});return send(res,r.state==='rejected'?409:r.state==='pending'?202:200,{id:r.order_id,status:r.status,pending:r.state==='pending',commandId:r.id,...(r.state!=='applied'&&r.error?{error:r.error}:{})})}
 let text='';for await(const chunk of req){text+=chunk;if(Buffer.byteLength(text)>4096)fail('Eingabe zu groß',400)}let b;try{b=JSON.parse(text)}catch{fail('Ungültige Eingabe',400)}
 const result=await requestPosStockAction(pool,actor,action[1],b);return send(res,result.pending?202:200,result);
 }catch(e){if(e.status)return send(res,e.status,{error:e.message});if(e.code==='P0001')return send(res,409,{error:e.message});throw e}
 };
}
