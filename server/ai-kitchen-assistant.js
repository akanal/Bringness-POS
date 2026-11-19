import {uuid} from './ai-policy.js';
import {validDay} from './ai-planning-core.js';
import {berlinClock} from './ai-forecast-core.js';
import {lockAiRestaurant} from './ai-write-authorization.js';
import {wasteRecommendations,preparationRecommendations} from './ai-kitchen-assistant-core.js';
const fail=(m,status=400)=>{throw Object.assign(Error(m),{status})};
const id=v=>{if(!uuid.test(String(v)))fail('Gültige Kennung erforderlich');return v};
export async function migrateKitchenAssistant(db){await db.query(`
CREATE TABLE IF NOT EXISTS ai_kitchen_assistant_settings(location_id uuid PRIMARY KEY REFERENCES ai_locations(id),waste_enabled boolean NOT NULL DEFAULT false,preparation_enabled boolean NOT NULL DEFAULT false,version int NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS ai_stock_lots(id uuid PRIMARY KEY,account_id uuid NOT NULL REFERENCES ai_accounts(id),location_id uuid NOT NULL REFERENCES ai_locations(id),stock_id uuid NOT NULL REFERENCES ai_stock(id),label text NOT NULL,quantity numeric(15,3) NOT NULL CHECK(quantity>=0),expires_on date,date_kind text NOT NULL CHECK(date_kind IN ('best_before','use_by')),opened_on date,opened_expires_on date,checked_on date NOT NULL,stock_at_check numeric(15,3) NOT NULL,movement_at_check bigint NOT NULL DEFAULT 0,version int NOT NULL DEFAULT 1,updated_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS ai_stock_lots_location ON ai_stock_lots(account_id,location_id,stock_id);
`);}
const settings=r=>({wasteEnabled:r?.waste_enabled===true,preparationEnabled:r?.preparation_enabled===true,version:r?.version||0});
export async function kitchenAssistantRoutes(path,method,b,user,url,{db,forecast}={}){
 if(user.role!=='restaurant')fail('Nur für Restaurantbetreiber',403);
 const locationId=id(method==='GET'?url.searchParams.get('locationId'):b.locationId),today=berlinClock().date;
 if(method==='POST'){
  const c=await db.connect();try{await c.query('BEGIN');await lockAiRestaurant(c,user.id);if(!(await c.query('SELECT id FROM ai_locations WHERE id=$1 AND account_id=$2 FOR SHARE',[locationId,user.id])).rowCount)fail('Standort nicht gefunden',404);
   if(path==='/api/ai/kitchen-assistant/settings'){
    if(typeof b.wasteEnabled!=='boolean'||typeof b.preparationEnabled!=='boolean'||!Number.isSafeInteger(b.version)||b.version<0)fail('Beide Schalter und aktuelle Version erforderlich');
    await c.query('INSERT INTO ai_kitchen_assistant_settings(location_id) VALUES($1) ON CONFLICT DO NOTHING',[locationId]);
    const saved=await c.query('UPDATE ai_kitchen_assistant_settings SET waste_enabled=$2,preparation_enabled=$3,version=version+1 WHERE location_id=$1 AND version=$4 RETURNING *',[locationId,b.wasteEnabled,b.preparationEnabled,b.version]);if(!saved.rowCount)fail('Einstellungen wurden geändert. Neu laden.',409);
    await c.query("INSERT INTO ai_audit(actor_id,target_id,action) VALUES($1,$2,'kitchen_assistant_settings')",[user.id,locationId]);await c.query('COMMIT');return {ok:true,settings:settings(saved.rows[0])};
   }
   if(path!=='/api/ai/kitchen-assistant/lot')fail('Funktion nicht gefunden',404);
   const lotId=id(b.id),stockId=id(b.stockId),label=typeof b.label==='string'?b.label.trim():'';
   if(!label||label.length>150||typeof b.quantity!=='number'||!Number.isFinite(b.quantity)||b.quantity<0||b.quantity>1000000||Math.abs(b.quantity*1000-Math.round(b.quantity*1000))>.00001||!Number.isSafeInteger(b.version)||b.version<0||!['best_before','use_by'].includes(b.dateKind))fail('Gültige Chargenangaben erforderlich');
   for(const d of [b.expiresOn,b.openedOn,b.openedExpiresOn])if(d!==''&&d!==null&&!validDay(d))fail('Gültige Datumsangaben erforderlich');
   if(b.openedOn&&b.openedOn>today||b.openedExpiresOn&&!b.openedOn||b.openedOn&&b.openedExpiresOn&&b.openedExpiresOn<b.openedOn)fail('Anbruchdaten prüfen');
   const stock=(await c.query('SELECT s.*,(SELECT coalesce(max(m.id),0)::text FROM ai_stock_moves m WHERE m.stock_id=s.id) movement_id FROM ai_stock s WHERE s.id=$1 AND s.account_id=$2 AND s.location_id=$3 FOR UPDATE OF s',[stockId,user.id,locationId])).rows[0];if(!stock)fail('Zutat nicht gefunden',404);
   const other=(await c.query('SELECT coalesce(sum(quantity),0)::text quantity,count(*)::int count FROM ai_stock_lots WHERE account_id=$1 AND location_id=$2 AND stock_id=$3 AND id<>$4',[user.id,locationId,stockId,lotId])).rows[0];if(Number(other.quantity)+b.quantity>Number(stock.quantity))fail('Chargenmengen übersteigen den aktuellen Bestand. Mengen prüfen.',409);if(other.count>=500)fail('Zu viele Chargen für diese Zutat',409);
   const args=[lotId,user.id,locationId,stockId,label,b.quantity,b.expiresOn||null,b.dateKind,b.openedOn||null,b.openedExpiresOn||null,today,stock.quantity,stock.movement_id];let result;
   if(b.version===0)result=await c.query('INSERT INTO ai_stock_lots(id,account_id,location_id,stock_id,label,quantity,expires_on,date_kind,opened_on,opened_expires_on,checked_on,stock_at_check,movement_at_check) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) ON CONFLICT DO NOTHING RETURNING version',args);
   else result=await c.query('UPDATE ai_stock_lots SET label=$5,quantity=$6,expires_on=$7,date_kind=$8,opened_on=$9,opened_expires_on=$10,checked_on=$11,stock_at_check=$12,movement_at_check=$13,version=version+1,updated_at=now() WHERE id=$1 AND account_id=$2 AND location_id=$3 AND stock_id=$4 AND version=$14 RETURNING version',[...args,b.version]);
   if(!result.rowCount)fail('Charge bereits gespeichert oder geändert. Neu laden.',409);
   await c.query("INSERT INTO ai_audit(actor_id,target_id,action) VALUES($1,$2,'stock_lot_metadata')",[user.id,stockId]);await c.query('COMMIT');return {ok:true,version:result.rows[0].version};
  }catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}
 }
 if(method!=='GET'||path!=='/api/ai/kitchen-assistant')fail('Methode nicht erlaubt',405);
 if(!(await db.query("SELECT l.id FROM ai_locations l JOIN ai_accounts a ON a.id=l.account_id WHERE l.id=$1 AND l.account_id=$2 AND a.status='active' AND a.role='restaurant'",[locationId,user.id])).rowCount)fail('Standort nicht gefunden',404);
 const config=async()=>settings((await db.query('SELECT * FROM ai_kitchen_assistant_settings WHERE location_id=$1',[locationId])).rows[0]);const initial=await config();
 const stock=(await db.query('SELECT s.*,(SELECT coalesce(max(m.id),0)::text FROM ai_stock_moves m WHERE m.stock_id=s.id) movement_id FROM ai_stock s WHERE s.account_id=$1 AND s.location_id=$2 ORDER BY s.name,s.id',[user.id,locationId])).rows;
 const lots=(await db.query("SELECT *,to_char(expires_on,'YYYY-MM-DD') expires_on,to_char(opened_on,'YYYY-MM-DD') opened_on,to_char(opened_expires_on,'YYYY-MM-DD') opened_expires_on,to_char(checked_on,'YYYY-MM-DD') checked_on FROM ai_stock_lots l WHERE account_id=$1 AND location_id=$2 ORDER BY l.expires_on NULLS LAST,l.id LIMIT 2001",[user.id,locationId])).rows;if(lots.length>2000)fail('Chargenübersicht zu groß; Unterstützung erforderlich',409);
 const rows=(await db.query('SELECT r.id,r.name,r.external_code,r.active,i.stock_id,i.quantity FROM ai_recipes r JOIN ai_recipe_items i ON i.recipe_id=r.id WHERE r.account_id=$1 AND r.location_id=$2 ORDER BY r.id,i.stock_id',[user.id,locationId])).rows,recipeMap=new Map();for(const r of rows){if(!recipeMap.has(r.id))recipeMap.set(r.id,{...r,items:[]});recipeMap.get(r.id).items.push({stock_id:r.stock_id,quantity:Number(r.quantity)})}const recipes=[...recipeMap.values()];
 let preparation=[];let preparationMessage='Vorbereitungsempfehlungen ausgeschaltet.';
 if(initial.preparationEnabled){try{const f=await forecast(user.id,locationId);if(f.available){const history=(await db.query("SELECT to_char(day,'YYYY-MM-DD') AS day,orders::text,quality,products FROM ai_learning_days WHERE account_id=$1 AND location_id=$2 AND source_key=$3 AND day<$4::date",[user.id,locationId,f.learningSourceKey,today])).rows;preparation=preparationRecommendations([f,...f.nextDays],history,recipes);preparationMessage='Planungshinweise ohne automatische Buchung oder Bestellung.';}else preparationMessage=f.message;}catch(e){if(e.status===403)throw e;preparationMessage='Prognosedaten derzeit nicht verfügbar. Bitte später neu laden.';}}
 const current=await config();return {locationId,settings:current,stock,lots,waste:current.wasteEnabled?wasteRecommendations(stock,lots,recipes,today):null,preparation:current.preparationEnabled?preparation:[],preparationMessage:current.preparationEnabled?preparationMessage:'Vorbereitungsempfehlungen ausgeschaltet.'};
}
