import {aiPool,platformPool} from './ai-database.js';
import {uuid} from './ai-policy.js';
import {approximateDay,berlinClock} from './ai-forecast-core.js';
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status})};
export async function migrateAiForecast(){await aiPool().query(`
CREATE TABLE IF NOT EXISTS ai_forecast_snapshots(account_id uuid NOT NULL REFERENCES ai_accounts(id),location_id uuid NOT NULL REFERENCES ai_locations(id),day date NOT NULL,hour int NOT NULL CHECK(hour BETWEEN 0 AND 23),captured_at timestamptz NOT NULL DEFAULT now(),result jsonb NOT NULL,PRIMARY KEY(account_id,location_id,day,hour));
`)}
export async function locationForecast(accountId,locationId,{capture=true}={}){
 const pool=aiPool();
 if(!uuid.test(String(locationId)))fail('Standort erforderlich');
 const location=(await pool.query('SELECT id,name FROM ai_locations WHERE id=$1 AND account_id=$2',[locationId,accountId])).rows[0];if(!location)fail('Standort nicht gefunden',404);
 const links=(await pool.query("SELECT c.* FROM ai_connectors c JOIN ai_accounts a ON a.id=c.account_id WHERE c.account_id=$1 AND c.location_id=$2 AND c.kind='pos' AND c.active AND a.status='active'",[accountId,locationId])).rows;
 if(!links.length)return {location,available:false,message:'Für diesen Standort zuerst Bringness POS unter Kassen & API anbinden und aktivieren.'};
 const ids=[];for(const link of links){if(!(await platformPool.query("SELECT 1 FROM users u JOIN restaurants r ON r.company_id=u.company_id WHERE u.id=$1 AND r.id=$2 AND u.company_id=$3 AND u.status='active' AND u.role IN ('owner','admin') AND NOT COALESCE(u.must_change_password,false)",[link.pos_user_id,link.pos_restaurant_id,link.pos_company_id])).rowCount)fail('Inhaberfreigabe der Kasse nicht mehr gültig',403);ids.push(link.pos_restaurant_id)}
 const now=new Date(),clock=berlinClock(now);
 const rows=(await platformPool.query(`SELECT to_char(COALESCE(closed_at,created_at) AT TIME ZONE 'Europe/Berlin','YYYY-MM-DD') AS day,extract(hour FROM COALESCE(closed_at,created_at) AT TIME ZONE 'Europe/Berlin')::int AS hour,count(*)::int AS orders,coalesce(sum(total_cents),0)::text revenue_cents FROM orders WHERE restaurant_id=ANY($1::uuid[]) AND status='paid' AND COALESCE(closed_at,created_at)>=$2::timestamptz-interval '400 days' AND COALESCE(closed_at,created_at)<=$2::timestamptz GROUP BY 1,2 ORDER BY 1,2`,[[...new Set(ids)],now.toISOString()])).rows;
 const forecast=approximateDay(rows,clock);
 const stored={...forecast};delete stored.history;
 if(capture)await pool.query('INSERT INTO ai_forecast_snapshots(account_id,location_id,day,hour,result) VALUES($1,$2,$3,$4,$5::jsonb) ON CONFLICT(account_id,location_id,day,hour) DO UPDATE SET captured_at=now(),result=EXCLUDED.result',[accountId,locationId,clock.date,clock.hour,JSON.stringify(stored)]);
 const snapshots=(await pool.query("SELECT DISTINCT ON(day) to_char(day,'YYYY-MM-DD') AS day,captured_at,result FROM ai_forecast_snapshots WHERE account_id=$1 AND location_id=$2 ORDER BY day DESC,hour ASC LIMIT 400",[accountId,locationId])).rows;
 // Ingredient use comes from mapped POS items with original sale dates, not import times.
 const comparisonDates=forecast.comparisonDates;
 const ingredients=(await pool.query('SELECT s.id,s.name,s.unit,s.quantity,s.minimum,r.external_code,i.quantity recipe_quantity FROM ai_recipes r JOIN ai_recipe_items i ON i.recipe_id=r.id JOIN ai_stock s ON s.id=i.stock_id WHERE r.account_id=$1 AND r.location_id=$2 AND r.active AND s.account_id=$1 AND s.location_id=$2',[accountId,locationId])).rows;
 const consumption=forecast.ready?(await platformPool.query(`SELECT to_char(COALESCE(o.closed_at,o.created_at) AT TIME ZONE 'Europe/Berlin','YYYY-MM-DD') AS day,oi.product_id::text product_code,sum(oi.quantity)::text quantity FROM order_items oi JOIN orders o ON o.id=oi.order_id WHERE o.restaurant_id=ANY($1::uuid[]) AND o.status='paid' AND to_char(COALESCE(o.closed_at,o.created_at) AT TIME ZONE 'Europe/Berlin','YYYY-MM-DD')=ANY($2::text[]) GROUP BY 1,2`,[ids,comparisonDates])).rows:[];
 const incoming=(await pool.query("SELECT stock_id,coalesce(sum(pack_quantity*packs),0)::text quantity FROM ai_orders WHERE buyer_id=$1 AND status='accepted' AND NOT unavailable AND delivery_date<=$2::date GROUP BY stock_id",[accountId,clock.date])).rows;
 const amounts=new Map();for(const i of ingredients){let x=amounts.get(i.id);if(!x){x={stockId:i.id,name:i.name,unit:i.unit,stock:Number(i.quantity),minimum:Number(i.minimum),dailyUse:0,incoming:Number(incoming.find(o=>o.stock_id===i.id)?.quantity||0)};amounts.set(i.id,x)}x.dailyUse+=consumption.filter(c=>c.product_code===i.external_code).reduce((sum,c)=>sum+Number(c.quantity)*Number(i.recipe_quantity),0)/Math.max(1,comparisonDates.length);}
 const suggestions=forecast.ready?[...amounts.values()].map(x=>({...x,expectedUse:Math.ceil(x.dailyUse*forecast.pace*1000)/1000,suggestedQuantity:Math.ceil(Math.max(0,Math.max(x.minimum,x.dailyUse*forecast.pace)-x.stock-x.incoming)*1000)/1000})):[];
 return {location,available:true,...forecast,snapshots,suggestions,updatedAt:now.toISOString(),weather:'Noch nicht angebunden',events:'Noch nicht angebunden',basis:'Bezahlte POS-Bestellungen nach Zahlungszeit, keine Personenzählung. Nur Vergleichstage mit Verkäufen; Ruhetage und Datenlücken sind noch nicht unterscheidbar. Spannen sind grobe Orientierung, keine statistische Garantie. Mengen planen einen vollen vergleichbaren Tag; bestätigte Lieferungen bis heute zählen mit. Keine automatische Bestellung.'};
}
let running=false;
export async function forecastTick(){if(running)return;running=true;try{const accounts=(await aiPool().query("SELECT DISTINCT c.account_id,c.location_id FROM ai_connectors c JOIN ai_accounts a ON a.id=c.account_id WHERE c.kind='pos' AND c.active AND a.status='active' ORDER BY c.account_id,c.location_id")).rows;for(const x of accounts){try{await locationForecast(x.account_id,x.location_id)}catch(e){console.error('AI forecast unavailable:',e.status||e.code||e.name)}}}finally{running=false}}
export async function forecastRoutes(path,method,user,url){if(user.role!=='restaurant')fail('Nur Restaurants haben Tagesprognosen',403);if(method!=='GET')fail('Methode nicht erlaubt',405);return locationForecast(user.id,url.searchParams.get('locationId'));}
