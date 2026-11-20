import {uuid} from './ai-policy.js';
import {lockAiRestaurant} from './ai-write-authorization.js';
import {applyPosAiPrice} from './pos-ai-prices.js';

export async function aiPriceTick(ai,pos) {
 if(!(await pos.query("SELECT to_regclass('pos_ai_price_rules') rules")).rows[0]?.rules)return;
 const rules=(await pos.query('SELECT restaurant_id,product_ids FROM pos_ai_price_rules WHERE enabled ORDER BY restaurant_id')).rows;
 for(const rule of rules){
  const links=(await ai.query(`SELECT c.id,c.account_id FROM ai_connectors c JOIN ai_accounts a ON a.id=c.account_id
   WHERE c.kind='pos' AND c.active AND c.pos_restaurant_id=$1 AND a.status='active' AND a.role='restaurant'`,[rule.restaurant_id])).rows;
  if(links.length!==1)continue;
  await applyRestaurantActions(ai,pos,links[0],rule.product_ids);
 }
}

async function applyRestaurantActions(ai,pos,initial,productIds) {
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
     coalesce(bool_or(l.expires_on=(now() AT TIME ZONE 'Europe/Berlin')::date),false) AS urgent
    FROM available s LEFT JOIN ai_stock_lots l ON l.stock_id=s.id AND l.account_id=$1 AND l.location_id=$2 AND l.quantity>0
    GROUP BY s.id,s.quantity,s.reserved_quantity,s.movement_id
   )
   SELECT r.external_code,to_char((now() AT TIME ZONE 'Europe/Berlin')::date,'YYYY-MM-DD') sale_day FROM ai_recipes r JOIN ai_recipe_items i ON i.recipe_id=r.id
   LEFT JOIN usable u ON u.id=i.stock_id
   WHERE r.account_id=$1 AND r.location_id=$2 AND r.active AND r.external_code=ANY($3::text[])
   GROUP BY r.id,r.external_code
   HAVING bool_and(coalesce(u.eligible AND u.free>=i.quantity,false)) AND bool_or(u.urgent)
   ORDER BY r.external_code`,[link.account_id,link.location_id,productIds])).rows;
   if(candidates.length){
    p=await pos.connect();await p.query('BEGIN');
    const permitted=await p.query(`SELECT u.id FROM users u JOIN restaurants r ON r.company_id=u.company_id
     WHERE u.id=$1 AND r.id=$2 AND u.company_id=$3 AND u.status='active' AND u.role IN ('owner','admin')
     AND NOT coalesce(u.must_change_password,false) FOR SHARE OF u,r`,[link.pos_user_id,link.pos_restaurant_id,link.pos_company_id]);
    if(permitted.rowCount)for(const candidate of candidates)if(uuid.test(candidate.external_code))await applyPosAiPrice(p,link,candidate.external_code,candidate.sale_day);
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
