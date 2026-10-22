import {permanentStockFailure,stockBatchLimit,stockFailureMessage} from './stock-retry-policy.js';
import crypto from 'node:crypto';
const key=(id,action)=>{const b=crypto.createHash('sha256').update('offline-stock:'+id+':'+action).digest().subarray(0,16);b[6]=(b[6]&15)|0x40;b[8]=(b[8]&63)|0x80;return [...b].map(x=>x.toString(16).padStart(2,'0')).join('').replace(/^(........)(....)(....)(....)(............)$/,'$1-$2-$3-$4-$5')};
export async function processOfflineStock(pos,ai,kitchenAction,ingestSale,{limit=100}={}){
 limit=stockBatchLimit(limit);
 const rows=(await pos.query("SELECT s.id,s.order_id,s.stock_attempts,o.restaurant_id,c.company_id,COALESCE(o.closed_at,o.created_at) paid_time FROM pos_offline_sales s JOIN orders o ON o.id=s.order_id JOIN pos_offline_catalogs c ON c.id=s.catalog_id WHERE s.stock_state='pending' AND (s.stock_retry_after IS NULL OR s.stock_retry_after<=now()) ORDER BY s.stock_retry_after NULLS FIRST,s.created_at,s.id LIMIT $1",[limit])).rows;
 // Another worker may already be transferring a selected sale. Skip its lock
 // instead of holding up unrelated restaurants behind that network request.
 const errors=[];
 for(const row of rows){let c,expectedAttempts=row.stock_attempts??0;try{c=await pos.connect();await c.query('BEGIN');const locked=(await c.query('SELECT stock_state,stock_attempts FROM pos_offline_sales WHERE id=$1 AND (stock_retry_after IS NULL OR stock_retry_after<=now()) FOR UPDATE SKIP LOCKED',[row.id])).rows[0];if(locked?.stock_state!=='pending'){await c.query('ROLLBACK');continue}expectedAttempts=locked.stock_attempts??expectedAttempts;
  // Refresh joined metadata after locking: selection may predate an ownership change.
  const current=(await c.query('SELECT o.restaurant_id,c.company_id,COALESCE(o.closed_at,o.created_at) paid_time FROM pos_offline_sales s JOIN orders o ON o.id=s.order_id JOIN pos_offline_catalogs c ON c.id=s.catalog_id WHERE s.id=$1 AND o.id=$2',[row.id,row.order_id])).rows[0];
  if(!current)throw Object.assign(new Error('Offline-Bestellung nicht mehr zugeordnet'),{status:409});
  Object.assign(row,current);
  // Validate catalog ownership against the current restaurant before any AI write.
  if(!(await c.query('SELECT id FROM restaurants WHERE id=$1 AND company_id=$2 FOR SHARE',[row.restaurant_id,row.company_id])).rowCount)throw Object.assign(new Error('Offline-Katalog und Kassenbetrieb gehören nicht zur selben Firma'),{status:409});
  const link=(await ai.query("SELECT c.* FROM ai_connectors c JOIN ai_accounts a ON a.id=c.account_id WHERE c.pos_restaurant_id=$1 AND c.pos_company_id=$2 AND c.kind='pos' AND c.active AND a.status='active'",[row.restaurant_id,row.company_id])).rows[0];
  if(!link){await c.query("UPDATE pos_offline_sales SET stock_state='not_linked',stock_error=NULL,stock_retry_after=NULL WHERE id=$1",[row.id]);await c.query('COMMIT');continue}
  if(!(await c.query("SELECT 1 FROM users WHERE id=$1 AND company_id=$2 AND status='active' AND role IN ('owner','admin') AND NOT coalesce(must_change_password,false)",[link.pos_user_id,row.company_id])).rowCount)throw Error('Inhaberfreigabe der Kasse prüfen');
  const items=(await c.query('SELECT product_id,quantity FROM order_items WHERE order_id=$1 AND product_id IS NOT NULL ORDER BY product_id',[row.order_id])).rows.map(i=>({productCode:String(i.product_id),quantity:Number(i.quantity)}));
  if(link.consumption_mode==='lifecycle'){
   await kitchenAction(ai,{id:link.account_id,role:'restaurant'},{requestKey:key(row.id,'accept'),orderId:'pos:'+row.order_id,action:'accept',occurredAt:new Date(row.paid_time).toISOString(),items,reason:''},link);
   await kitchenAction(ai,{id:link.account_id,role:'restaurant'},{requestKey:key(row.id,'start'),orderId:'pos:'+row.order_id,action:'start',occurredAt:new Date(row.paid_time).toISOString(),reason:''},link);
  }else await ingestSale(link,{eventId:'pos:'+row.order_id,type:'sale',occurredAt:new Date(row.paid_time).toISOString(),items});
  await c.query("UPDATE pos_offline_sales SET stock_state='applied',stock_error=NULL,stock_retry_after=NULL WHERE id=$1",[row.id]);await c.query('COMMIT');
 // After rollback a different worker may have completed the same sale.
 // An older failure must never reset its committed applied/not_linked state.
 }catch(e){
  // Return the transaction client before asking the same pool to store diagnostics.
  // Otherwise a one-connection pool waits forever for its own checked-out client.
  if(c){let broken;try{await c.query('ROLLBACK')}catch(rollbackError){broken=rollbackError;errors.push(rollbackError)}finally{c.release(broken);c=null}}
  try{await pos.query("UPDATE pos_offline_sales SET stock_state=$2,stock_error=$3,stock_attempts=LEAST(2147483646,GREATEST(0,stock_attempts))+1,stock_retry_after=CASE WHEN $2='pending' THEN now()+make_interval(secs=>LEAST(300,5*power(2,LEAST(GREATEST(stock_attempts,0),6)))::int) ELSE NULL END WHERE id=$1 AND stock_state='pending' AND stock_attempts=$4 AND (stock_retry_after IS NULL OR stock_retry_after<=now())",[row.id,permanentStockFailure(e)?'conflict':'pending',stockFailureMessage(e),expectedAttempts])}catch(reportError){errors.push(reportError)}
 }finally{c?.release()}}
 if(errors.length)throw new AggregateError(errors,'Nicht alle Offline-Lagerfehler konnten verarbeitet werden');
}
