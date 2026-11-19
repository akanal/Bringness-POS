import {historySourceKey} from './ai-learning-history-core.js';
import {preparationRecommendations} from './ai-kitchen-assistant-core.js';
import {berlinClock} from './ai-forecast-core.js';
import {uuid} from './ai-policy.js';
import {lockAiRestaurant} from './ai-write-authorization.js';
export function menuPriceSuggestion(recipe,product,targetCostBps){
 const tax=Number(product?.tax_rate),valid=product&&product.tax_rate!==null&&product.tax_rate!==undefined&&Number.isFinite(tax)&&tax>=0&&tax<=100;
 const cost=recipe.cost,previous=recipe.previousCost;
 const suggested=cost.complete&&valid&&Number.isInteger(targetCostBps)&&targetCostBps>=100&&targetCostBps<=10000?Math.ceil(cost.netCents*(1+tax/100)*10000/targetCostBps):null;
 return {recipeId:recipe.id,name:recipe.name,netCostCents:cost.complete?cost.netCents:null,
  previousNetCostCents:previous?.complete?previous.netCents:null,
  costChangeCents:cost.complete&&previous?.complete?cost.netCents-previous.netCents:null,
  suggestedGrossCents:Number.isSafeInteger(suggested)&&suggested>=0&&suggested<=10000000?suggested:null,
  currentGrossCents:product?.price_cents??null,targetCostBps,
  basis:'Ziel-Wareneinsatz vom Betreiber, aktueller POS-Steuersatz und letzte bestätigte Nettowarenkosten. Ohne Personal/Gemeinkosten. Vorherige Kosten aus jeweils vorletztem bestätigtem Wareneingang; kein historischer Kartenpreis.'};
}
// Forecasting uses its existing account locks. Never invoke it while holding a
// menu account transaction. Validate settings/session again after that work.
export async function menuRecommendations(user,locationId,{db,forecast,sessionHash,posDb}){
 const fail=(m,status=403)=>{throw Object.assign(Error(m),{status})};
 if(user.role!=='restaurant'||!uuid.test(String(locationId)))fail('Gültigen eigenen Standort wählen');
 const initial=(await db.query('SELECT s.* FROM ai_menu_settings s JOIN ai_locations l ON l.id=s.location_id WHERE l.id=$1 AND l.account_id=$2',[locationId,user.id])).rows[0];
 if(!initial?.enabled||!initial.read_sales)fail('Verkaufsdatenzugriff der Speisekartenassistenz einschalten');
 const f=await forecast(user.id,locationId),c=await db.connect();let p;
 try{await c.query('BEGIN');await lockAiRestaurant(c,user.id);
  if(sessionHash&&!(await c.query('SELECT 1 FROM ai_sessions WHERE token_hash=$1 AND account_id=$2 AND expires_at>now() FOR SHARE',[sessionHash,user.id])).rowCount)fail('Sitzung abgelaufen',401);
  const s=(await c.query('SELECT * FROM ai_menu_settings WHERE location_id=$1 FOR SHARE',[locationId])).rows[0];if(!s?.enabled||!s.read_sales||s.version!==initial.version)fail('Zugriff geändert. Neu laden.',409);
  if(!f.available){await c.query('COMMIT');return {preparation:[],message:f.message};}
  const links=(await c.query("SELECT * FROM ai_connectors WHERE account_id=$1 AND location_id=$2 AND kind='pos' AND active ORDER BY id FOR SHARE",[user.id,locationId])).rows;
  if(!links.length||historySourceKey(links)!==f.learningSourceKey)fail('Verkaufsanbindung geändert. Neu laden.',409);
  if(posDb){p=await posDb.connect();await p.query('BEGIN');for(const l of links)if(!(await p.query("SELECT u.id FROM users u JOIN restaurants r ON r.company_id=u.company_id WHERE u.id=$1 AND r.id=$2 AND u.company_id=$3 AND u.status='active' AND u.role IN ('owner','admin') AND NOT COALESCE(u.must_change_password,false) FOR SHARE OF u,r",[l.pos_user_id,l.pos_restaurant_id,l.pos_company_id])).rowCount)fail('Inhaberfreigabe der Kasse nicht mehr gültig');}
  const recipes=(await c.query('SELECT id,name,external_code,active FROM ai_recipes WHERE account_id=$1 AND location_id=$2 ORDER BY id LIMIT 501',[user.id,locationId])).rows;
  if(recipes.length>500)fail('Zu viele Rezepte',409);
  for(const r of recipes)r.items=(await c.query('SELECT stock_id,quantity FROM ai_recipe_items WHERE recipe_id=$1 ORDER BY stock_id',[r.id])).rows;
  const history=(await c.query("SELECT to_char(day,'YYYY-MM-DD') AS day,orders::text,quality,products FROM ai_learning_days WHERE account_id=$1 AND location_id=$2 AND source_key=$3 AND day<$4::date",[user.id,locationId,f.learningSourceKey,berlinClock().date])).rows;
  // An absent article history is unknown, not evidence of zero sales.
  const observed=recipes.filter(r=>history.some(d=>d.quality==='sales'&&(d.products||[]).some(p=>p.product_code===r.external_code)));
  const preparation=preparationRecommendations([f,...f.nextDays],history,observed);
  const surplus=[];
  if(s.read_stock&&preparation.length&&preparation.every(d=>d.available)){
   const stock=(await c.query('SELECT id,name,unit,quantity,reserved_quantity FROM ai_stock WHERE account_id=$1 AND location_id=$2 ORDER BY id',[user.id,locationId])).rows;
   for(const item of stock){const needed=preparation.reduce((n,d)=>n+d.items.reduce((a,r)=>a+r.ingredients.filter(i=>i.stockId===item.id).reduce((x,i)=>x+i.quantity,0),0),0),free=Math.max(0,Number(item.quantity)-Number(item.reserved_quantity));
    if(needed>0&&free>needed)surplus.push({stockId:item.id,name:item.name,unit:item.unit,free,planned:needed,surplus:Math.round((free-needed)*1000)/1000,recipeIds:observed.filter(r=>r.active&&r.items.some(i=>i.stock_id===item.id)).map(r=>r.id)});
   }
  }
  if(p)await p.query('COMMIT');await c.query('COMMIT');return {preparation,surplus,message:'Planmengen und rechnerischer Überschuss aus vorhandener Prognose und Artikelhistorie. Andere Verbräuche, Haltbarkeit und Zustand vor Bewerbung prüfen. Keine Verwendungsfreigabe, Lagerbuchung oder automatische Mengenänderung.'};
 }catch(e){if(p)await p.query('ROLLBACK');await c.query('ROLLBACK');throw e}finally{p?.release();c.release()}
}
