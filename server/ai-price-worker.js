import {priceDecision} from './ai-price-rules.js';
import {uuid} from './ai-policy.js';
import {lockAiRestaurant} from './ai-write-authorization.js';
import {applyPosAiPrice} from './pos-ai-prices.js';

export async function aiPriceTick(ai,pos) {
 if(!(await pos.query("SELECT to_regclass('pos_ai_price_links') links")).rows[0]?.links)return;
 const links=(await ai.query(`SELECT c.id,c.account_id,c.pos_restaurant_id,c.pos_company_id,c.pos_user_id FROM ai_connectors c
   JOIN ai_accounts a ON a.id=c.account_id
   WHERE c.kind='pos' AND c.active AND a.status='active' AND a.role='restaurant'`)).rows;
 const active=new Map(links.map(link=>[link.pos_restaurant_id,link]));
 if(active.size!==links.length){
  const counts=new Map();
  for(const {pos_restaurant_id:id} of links)counts.set(id,(counts.get(id)||0)+1);
  for(const [id,count] of counts)if(count!==1)active.delete(id);
 }
 const candidates=[...active.values()];
 await pos.query(`INSERT INTO pos_ai_price_links(restaurant_id,checked_at,rule_version)
  SELECT r.id,now(),2 FROM unnest($1::uuid[],$2::uuid[],$3::uuid[]) AS l(restaurant_id,company_id,user_id)
  JOIN restaurants r ON r.id=l.restaurant_id AND r.company_id=l.company_id
  JOIN users u ON u.id=l.user_id AND u.company_id=r.company_id AND u.status='active'
   AND u.role IN ('owner','admin') AND NOT coalesce(u.must_change_password,false)
  ON CONFLICT(restaurant_id) DO UPDATE SET checked_at=EXCLUDED.checked_at,rule_version=2`,
  [candidates.map(l=>l.pos_restaurant_id),candidates.map(l=>l.pos_company_id),candidates.map(l=>l.pos_user_id)]);
 const rules=(await pos.query('SELECT restaurant_id,product_ids,triggers FROM pos_ai_price_rules WHERE enabled ORDER BY restaurant_id')).rows;
 for(const rule of rules){
  const link=active.get(rule.restaurant_id);
  if(link)await applyRestaurantActions(ai,pos,link,rule);
 }
}

async function applyRestaurantActions(ai,pos,initial,{product_ids:productIds,triggers}) {
 const a=await ai.connect();let p;
 try {
  await a.query('BEGIN');
  await lockAiRestaurant(a,initial.account_id);
  const link=(await a.query("SELECT * FROM ai_connectors WHERE id=$1 AND kind='pos' AND active FOR SHARE",[initial.id])).rows[0];
  if(link){
   const candidates=(await a.query(`WITH available AS (
    SELECT s.*, (SELECT coalesce(max(m.id),0) FROM ai_stock_moves m WHERE m.stock_id=s.id) movement_id
    FROM ai_stock s WHERE s.account_id=$1 AND s.location_id=$2
   ), usable AS (
    SELECT s.id,s.quantity-s.reserved_quantity AS free,
     count(l.id)>0 AND coalesce(bool_and(coalesce(l.opening_state='sealed' AND l.date_kind='best_before'
     AND l.expires_on >= (now() AT TIME ZONE 'Europe/Berlin')::date
     AND l.checked_on=(now() AT TIME ZONE 'Europe/Berlin')::date
     AND l.movement_at_check=s.movement_id AND l.stock_at_check=s.quantity,false)),false)
     AND coalesce(sum(l.quantity),0)=s.quantity AS eligible,
     coalesce(bool_or(l.expires_on=(now() AT TIME ZONE 'Europe/Berlin')::date),false) AS urgent,
     coalesce(bool_or(l.expires_on<(now() AT TIME ZONE 'Europe/Berlin')::date),false) AS expired
    FROM available s LEFT JOIN ai_stock_lots l ON l.stock_id=s.id AND l.account_id=$1 AND l.location_id=$2 AND l.quantity>0
    GROUP BY s.id,s.quantity,s.reserved_quantity,s.movement_id
   )
   SELECT r.external_code,
    bool_and(coalesce(u.eligible AND u.free>=i.quantity,false)) AND bool_or(u.urgent) urgent,
    CASE WHEN bool_and(coalesce(u.free>=i.quantity AND i.quantity>0 AND NOT u.expired,false)) THEN floor(min(u.free/nullif(i.quantity,0))) ELSE 0 END portions,
    to_char((now() AT TIME ZONE 'Europe/Berlin')::date,'YYYY-MM-DD') sale_day FROM ai_recipes r JOIN ai_recipe_items i ON i.recipe_id=r.id
   LEFT JOIN usable u ON u.id=i.stock_id
   WHERE r.account_id=$1 AND r.location_id=$2 AND r.active AND r.external_code=ANY($3::text[])
   GROUP BY r.id,r.external_code
   ORDER BY r.external_code`,[link.account_id,link.location_id,productIds])).rows;
   const kinds=new Set(Object.values(triggers).map(rule=>rule.kind));
   let schedule={},forecast;
   if([...kinds].some(kind=>kind!=='expiry')){
    schedule=(await a.query(`SELECT to_char(now() AT TIME ZONE 'Europe/Berlin','HH24:MI') AS time,
      to_char(now() AT TIME ZONE 'Europe/Berlin','YYYY-MM-DD') AS day,
      extract(isodow FROM now() AT TIME ZONE 'Europe/Berlin')::int weekday,s.hours,s.closed_dates
      FROM (SELECT 1) seed LEFT JOIN ai_plan_settings s ON s.location_id=$1`,[link.location_id])).rows[0];
    if(kinds.has('forecast'))forecast=(await a.query(`SELECT result FROM ai_forecast_snapshots WHERE account_id=$1 AND location_id=$2
      AND day=$3::date AND captured_at BETWEEN now()-interval '90 minutes' AND now()
      ORDER BY captured_at DESC LIMIT 1`,[link.account_id,link.location_id,schedule.day])).rows[0]?.result;
   }
   const today=schedule.hours?.[schedule.weekday%7];
   const closed=schedule.closed_dates?.includes(schedule.day)||
    Array.isArray(schedule.hours)&&(!today||schedule.time<today.open||schedule.time>=today.close);
   if(candidates.length){
    p=await pos.connect();await p.query('BEGIN');
    const permitted=await p.query(`SELECT u.id FROM users u JOIN restaurants r ON r.company_id=u.company_id
     WHERE u.id=$1 AND r.id=$2 AND u.company_id=$3 AND u.status='active' AND u.role IN ('owner','admin')
     AND NOT coalesce(u.must_change_password,false) FOR SHARE OF u,r`,[link.pos_user_id,link.pos_restaurant_id,link.pos_company_id]);
    if(permitted.rowCount){
     let recentOrders;
     if(kinds.has('quiet'))recentOrders=(await p.query(`SELECT count(*)::int count FROM orders
      WHERE restaurant_id=$1 AND status='paid' AND coalesce(to_jsonb(orders)->>'source','')<>'pos_refund' AND coalesce(closed_at,created_at)>now()-interval '60 minutes'
      AND coalesce(closed_at,created_at)<=now()`,[link.pos_restaurant_id])).rows[0]?.count;
     for(const candidate of candidates){
      if(!uuid.test(candidate.external_code))continue;
      const rule=triggers[candidate.external_code]||{kind:'expiry'};
      const decision=priceDecision(rule,{urgent:candidate.urgent,portions:Number(candidate.portions),time:schedule.time,closing:today?.close,closed,recentOrders,forecast});
      if(decision)await applyPosAiPrice(p,link,candidate.external_code,candidate.sale_day,decision,triggers,schedule.time);
     }
    }
    await p.query('COMMIT');p.release();p=null;
   }
  }
  await a.query('COMMIT');
 } catch(error) {
  if(p)await p.query('ROLLBACK');
  await a.query('ROLLBACK');
  throw error;
 } finally {
  p?.release();
  a.release();
 }
}
