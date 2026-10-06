import crypto from 'node:crypto';
import {stockUnits,aggregateIngredients,lifecycleTransition} from './ai-stock-lifecycle-core.js';
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status})};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const id=x=>{if(!uuid.test(String(x)))fail('Ungültige ID');return String(x).toLowerCase()};
const label=x=>{if(typeof x!=='string'||!x.trim()||x.trim().length>150)fail('Bestellkennung erforderlich');return x.trim()};
export async function migrateStockLifecycle(pool){await pool.query(`
ALTER TABLE ai_stock ADD COLUMN IF NOT EXISTS reserved_quantity numeric(15,3) NOT NULL DEFAULT 0 CHECK(reserved_quantity>=0);
ALTER TABLE ai_stock ADD COLUMN IF NOT EXISTS target_quantity numeric(15,3);
UPDATE ai_stock SET target_quantity=minimum WHERE target_quantity IS NULL;
ALTER TABLE ai_stock ALTER COLUMN target_quantity SET NOT NULL;
ALTER TABLE ai_stock ALTER COLUMN target_quantity SET DEFAULT 0;
ALTER TABLE ai_connectors ADD COLUMN IF NOT EXISTS consumption_mode text NOT NULL DEFAULT 'sales' CHECK(consumption_mode IN ('sales','lifecycle'));
ALTER TABLE ai_recipes ADD COLUMN IF NOT EXISTS stock_blocked boolean NOT NULL DEFAULT false;
CREATE TABLE IF NOT EXISTS ai_kitchen_orders(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),account_id uuid NOT NULL REFERENCES ai_accounts(id),location_id uuid NOT NULL REFERENCES ai_locations(id),connector_id uuid REFERENCES ai_connectors(id),external_id text NOT NULL,state text NOT NULL CHECK(state IN ('accepted','preparing','cancelled')),items jsonb NOT NULL,ingredients jsonb NOT NULL,returned jsonb NOT NULL DEFAULT '{}',started_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now());
CREATE UNIQUE INDEX IF NOT EXISTS ai_kitchen_source ON ai_kitchen_orders(account_id,location_id,coalesce(connector_id,'00000000-0000-0000-0000-000000000000'::uuid),external_id);
CREATE TABLE IF NOT EXISTS ai_kitchen_requests(account_id uuid NOT NULL REFERENCES ai_accounts(id),request_key uuid NOT NULL,fingerprint text NOT NULL,response jsonb NOT NULL,PRIMARY KEY(account_id,request_key));
CREATE INDEX IF NOT EXISTS ai_kitchen_account ON ai_kitchen_orders(account_id,created_at DESC);
`)}
// Called within the same transaction as stock writes. Once blocked, only an
// explicit checked owner release can restore ordering; recipe.active is separate.
export async function blockUnavailableRecipes(c,accountId){await c.query(`UPDATE ai_recipes r SET stock_blocked=true WHERE r.account_id=$1 AND (NOT EXISTS(SELECT 1 FROM ai_recipe_items WHERE recipe_id=r.id) OR EXISTS(SELECT 1 FROM ai_recipe_items i JOIN ai_stock s ON s.id=i.stock_id WHERE i.recipe_id=r.id AND s.quantity-s.reserved_quantity<i.quantity))`,[accountId])}
export async function recipeAvailability(pool,accountId,locationId=null){return (await pool.query(`SELECT r.id,r.location_id,r.external_code,r.name,r.active,r.stock_blocked, (r.active AND NOT r.stock_blocked AND EXISTS(SELECT 1 FROM ai_recipe_items WHERE recipe_id=r.id) AND NOT EXISTS(SELECT 1 FROM ai_recipe_items i JOIN ai_stock s ON s.id=i.stock_id WHERE i.recipe_id=r.id AND s.quantity-s.reserved_quantity<i.quantity)) available FROM ai_recipes r WHERE r.account_id=$1 AND ($2::uuid IS NULL OR r.location_id=$2) ORDER BY r.name,r.id`,[accountId,locationId])).rows}
export async function kitchenAction(pool,u,b,connector=null){
 if(u.role!=='restaurant')fail('Nur Restaurantinhaber dürfen Lageraufträge buchen',403);
 const requestKey=id(b.requestKey),action=b.action;if(!['accept','start','cancel','return'].includes(action))fail('Ungültige Lageraktion');
 const locationId=connector?connector.location_id:id(b.locationId),externalId=label(b.orderId);
 const why=String(b.reason||'').trim();if(why.length>500||(['cancel','return'].includes(action)&&!why))fail('Begründung erforderlich');
 if(action==='return'&&b.confirmed!==true)fail('Unverbrauchte Zutaten ausdrücklich bestätigen');
 const normalizedItems=action==='accept'&&Array.isArray(b.items)?b.items.map(i=>({productCode:label(i.productCode),quantity:stockUnits(i.quantity)/1000})).sort((a,z)=>a.productCode.localeCompare(z.productCode)):undefined;
 const normalizedLines=action==='return'&&Array.isArray(b.lines)?b.lines.map(i=>({stockId:id(i.stockId),quantity:stockUnits(i.quantity)/1000})).sort((a,z)=>a.stockId.localeCompare(z.stockId)):undefined;
 const fingerprint=crypto.createHash('sha256').update(JSON.stringify({action,locationId,externalId,connectorId:connector?.id||null,items:normalizedItems,lines:normalizedLines,reason:why})).digest('hex'),c=await pool.connect();
 try{
  await c.query('BEGIN');const account=(await c.query("SELECT id FROM ai_accounts WHERE id=$1 AND role='restaurant' AND status='active' FOR UPDATE",[u.id])).rows[0];if(!account)fail('Restaurantkonto nicht aktiv',403);
  if(connector&&!(await c.query("SELECT 1 FROM ai_connectors WHERE id=$1 AND account_id=$2 AND location_id=$3 AND active AND consumption_mode='lifecycle'",[connector.id,u.id,locationId])).rowCount)fail('Anbindung nicht aktiv',403);
  const previous=(await c.query('SELECT * FROM ai_kitchen_requests WHERE account_id=$1 AND request_key=$2',[u.id,requestKey])).rows[0];if(previous){if(previous.fingerprint!==fingerprint)fail('Buchungskennung bereits anders verwendet',409);await c.query('COMMIT');return {...previous.response,replayed:true}}
  if(!(await c.query('SELECT 1 FROM ai_locations WHERE id=$1 AND account_id=$2',[locationId,u.id])).rowCount)fail('Standort nicht gefunden',404);
  let order=(await c.query('SELECT * FROM ai_kitchen_orders WHERE account_id=$1 AND location_id=$2 AND connector_id IS NOT DISTINCT FROM $3::uuid AND external_id=$4 FOR UPDATE',[u.id,locationId,connector?.id||null,externalId])).rows[0];
  if(action==='accept'){
   if(!connector&&(await c.query("SELECT 1 FROM ai_connectors WHERE account_id=$1 AND location_id=$2 AND active AND (consumption_mode='sales' OR kind='pos')",[u.id,locationId])).rowCount)fail('Manuelle Küchenbuchung würde die aktive Kassenanbindung doppeln. Zuerst einen eindeutigen Buchungsweg wählen.',409);
   if(!Array.isArray(b.items)||!b.items.length||b.items.length>100)fail('1 bis 100 Gerichte erforderlich');
   const items=b.items.map(i=>({productCode:label(i.productCode),quantity:stockUnits(i.quantity)/1000})).sort((a,z)=>a.productCode.localeCompare(z.productCode));if(items.some(i=>i.quantity<=0))fail('Positive Portionsmenge erforderlich');
   if(order){if(JSON.stringify(order.items)!==JSON.stringify(items))fail('Bestellung bereits mit anderen Positionen erfasst',409)}
   else{
    const lines=[];for(const item of items){const r=(await c.query('SELECT * FROM ai_recipes WHERE account_id=$1 AND location_id=$2 AND external_code=$3 AND active FOR UPDATE',[u.id,locationId,item.productCode])).rows[0];if(!r)fail('Rezept nicht gefunden: '+item.productCode,404);if(r.stock_blocked)fail('Gericht ist als ausverkauft gesperrt',409);const ingredients=(await c.query('SELECT stock_id,quantity FROM ai_recipe_items WHERE recipe_id=$1',[r.id])).rows;if(!ingredients.length)fail('Rezept ohne Zutaten');lines.push(...ingredients.map(i=>({stockId:i.stock_id,quantity:i.quantity,portions:item.quantity})))}
    const ingredients=aggregateIngredients(lines),stocks=(await c.query('SELECT * FROM ai_stock WHERE account_id=$1 AND location_id=$2 AND id=ANY($3::uuid[]) ORDER BY id FOR UPDATE',[u.id,locationId,ingredients.map(i=>i.stockId)])).rows;
    if(stocks.length!==ingredients.length)fail('Rezeptzutat gehört nicht zum Standort',409);
    for(const i of ingredients){const s=stocks.find(s=>s.id===i.stockId);if(Number(s.quantity)-Number(s.reserved_quantity)<i.quantity-0.0000001)fail('Nicht genügend freie Zutaten: '+s.name,409);await c.query('UPDATE ai_stock SET reserved_quantity=reserved_quantity+$2 WHERE id=$1',[i.stockId,i.quantity])}
    order=(await c.query("INSERT INTO ai_kitchen_orders(account_id,location_id,connector_id,external_id,state,items,ingredients) VALUES($1,$2,$3,$4,'accepted',$5::jsonb,$6::jsonb) RETURNING *",[u.id,locationId,connector?.id||null,externalId,JSON.stringify(items),JSON.stringify(ingredients)])).rows[0];
   }
  }else{
   if(!order)fail('Lagerauftrag nicht gefunden',404);const next=lifecycleTransition(order.state,action);
   const stocks=(await c.query('SELECT * FROM ai_stock WHERE account_id=$1 AND location_id=$2 AND id=ANY($3::uuid[]) ORDER BY id FOR UPDATE',[u.id,locationId,order.ingredients.map(i=>i.stockId)])).rows;
   for(const i of order.ingredients){const s=stocks.find(s=>s.id===i.stockId);if(!s)fail('Zutat nicht gefunden',409);if(['start','cancel'].includes(action)&&order.state==='accepted'){if(Number(s.reserved_quantity)<i.quantity-0.0000001)fail('Reservierung inkonsistent',409);await c.query('UPDATE ai_stock SET reserved_quantity=reserved_quantity-$2 WHERE id=$1',[i.stockId,i.quantity]);if(action==='start'){if(Number(s.quantity)<i.quantity-0.0000001)fail('Tatsächlicher Bestand reicht nicht: '+s.name,409);await c.query('UPDATE ai_stock SET quantity=quantity-$2 WHERE id=$1',[i.stockId,i.quantity]);await c.query("INSERT INTO ai_stock_moves(stock_id,actor_id,delta,reason,kind,quantity_before,quantity_after) VALUES($1,$2,$3,$4,'recipe_consumption',$5,$6)",[i.stockId,u.id,-i.quantity,'Zubereitung: '+externalId,s.quantity,Number(s.quantity)-i.quantity])}}}
   if(action==='return'){
    if(!order.started_at)fail('Keine verbrauchten Zutaten zum Zurückbuchen',409);if(!Array.isArray(b.lines)||!b.lines.length||b.lines.length>100)fail('Rückbuchungspositionen erforderlich');const seen=new Set();
    for(const l of b.lines){const stockId=id(l.stockId),amount=stockUnits(l.quantity)/1000,i=order.ingredients.find(i=>i.stockId===stockId),s=stocks.find(s=>s.id===stockId);if(seen.has(stockId)||!i||amount<=0||amount>i.quantity-Number(order.returned[stockId]||0)+0.0000001)fail('Rückbuchung übersteigt den verbleibenden Verbrauch',409);seen.add(stockId);await c.query('UPDATE ai_stock SET quantity=quantity+$2 WHERE id=$1',[stockId,amount]);await c.query("INSERT INTO ai_stock_moves(stock_id,actor_id,delta,reason,kind,quantity_before,quantity_after) VALUES($1,$2,$3,$4,'recipe_return',$5,$6)",[stockId,u.id,amount,why,s.quantity,Number(s.quantity)+amount]);order.returned[stockId]=Number(order.returned[stockId]||0)+amount}
   }
   order=(await c.query("UPDATE ai_kitchen_orders SET state=$2,returned=$3::jsonb,started_at=CASE WHEN $4='start' THEN now() ELSE started_at END,updated_at=now() WHERE id=$1 RETURNING *",[order.id,next,JSON.stringify(order.returned),action])).rows[0];
  }
  await blockUnavailableRecipes(c,u.id);const response={order};await c.query('INSERT INTO ai_kitchen_requests VALUES($1,$2,$3,$4::jsonb)',[u.id,requestKey,fingerprint,JSON.stringify(response)]);await c.query('INSERT INTO ai_audit(actor_id,target_id,action,detail) VALUES($1,$2,$3,$4::jsonb)',[u.id,order.id,'kitchen_'+action,JSON.stringify({externalId,reason:why,requestKey})]);await c.query('COMMIT');return response;
 }catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}
}
export async function kitchenRoutes(pool,path,method,b,u,url){
 if(!['/api/ai/kitchen-orders','/api/ai/recipe-availability','/api/ai/recipe-release'].includes(path))return null;
 if(u.role!=='restaurant')fail('Nur Restaurantinhaber haben Zugriff',403);
 if(path==='/api/ai/kitchen-orders'&&method==='GET')return {orders:(await pool.query('SELECT o.*,l.name location_name FROM ai_kitchen_orders o JOIN ai_locations l ON l.id=o.location_id WHERE o.account_id=$1 ORDER BY o.created_at DESC LIMIT 200',[u.id])).rows};
 if(path==='/api/ai/kitchen-orders'&&method==='POST'){
  if(b.connectorId){if(b.action!=='return')fail('Kassenauftrag wird in der Kasse gesteuert',403);const link=(await pool.query("SELECT * FROM ai_connectors WHERE id=$1 AND account_id=$2 AND active AND consumption_mode='lifecycle'",[id(b.connectorId),u.id])).rows[0];if(!link)fail('Lageranbindung nicht aktiv',403);return kitchenAction(pool,u,b,link)}
  return kitchenAction(pool,u,b);
 }
 if(path==='/api/ai/recipe-availability'&&method==='GET')return {recipes:await recipeAvailability(pool,u.id)};
 if(path==='/api/ai/recipe-release'&&method==='POST'){
  const recipeId=id(b.id),c=await pool.connect();try{await c.query('BEGIN');await c.query('SELECT id FROM ai_accounts WHERE id=$1 FOR UPDATE',[u.id]);const r=(await c.query('SELECT * FROM ai_recipes WHERE id=$1 AND account_id=$2 FOR UPDATE',[recipeId,u.id])).rows[0];if(!r)fail('Rezept nicht gefunden',404);const ingredients=(await c.query('SELECT i.quantity,s.quantity stock_quantity,s.reserved_quantity,s.id FROM ai_recipe_items i JOIN ai_stock s ON s.id=i.stock_id WHERE i.recipe_id=$1 AND s.account_id=$2 AND s.location_id=$3 ORDER BY s.id FOR UPDATE OF s',[recipeId,u.id,r.location_id])).rows;if(!ingredients.length||ingredients.some(i=>Number(i.stock_quantity)-Number(i.reserved_quantity)<Number(i.quantity)))fail('Zutaten reichen weiterhin nicht für eine Portion',409);await c.query('UPDATE ai_recipes SET stock_blocked=false WHERE id=$1',[recipeId]);await c.query("INSERT INTO ai_audit(actor_id,target_id,action) VALUES($1,$2,'recipe_released')",[u.id,recipeId]);await c.query('COMMIT');return {ok:true}}catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}
 }
 fail('Methode nicht erlaubt',405);
}
