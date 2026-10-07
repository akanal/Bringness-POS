import crypto from 'node:crypto';
const key=(id,action)=>{const b=crypto.createHash('sha256').update('offline-stock:'+id+':'+action).digest().subarray(0,16);b[6]=(b[6]&15)|0x40;b[8]=(b[8]&63)|0x80;return [...b].map(x=>x.toString(16).padStart(2,'0')).join('').replace(/^(........)(....)(....)(....)(............)$/,'$1-$2-$3-$4-$5')};
export async function processOfflineStock(pos,ai,kitchenAction,ingestSale){
 const rows=(await pos.query("SELECT s.id,s.order_id,o.restaurant_id,c.company_id FROM pos_offline_sales s JOIN orders o ON o.id=s.order_id JOIN pos_offline_catalogs c ON c.id=s.catalog_id WHERE s.stock_state='pending' ORDER BY s.created_at LIMIT 100")).rows;
 for(const row of rows){const c=await pos.connect();try{await c.query('BEGIN');const locked=(await c.query('SELECT stock_state FROM pos_offline_sales WHERE id=$1 FOR UPDATE',[row.id])).rows[0];if(locked?.stock_state!=='pending'){await c.query('ROLLBACK');continue}
  const link=(await ai.query("SELECT c.* FROM ai_connectors c JOIN ai_accounts a ON a.id=c.account_id WHERE c.pos_restaurant_id=$1 AND c.pos_company_id=$2 AND c.kind='pos' AND c.active AND a.status='active'",[row.restaurant_id,row.company_id])).rows[0];
  if(!link){await c.query("UPDATE pos_offline_sales SET stock_state='not_linked' WHERE id=$1",[row.id]);await c.query('COMMIT');continue}
  if(!(await c.query("SELECT 1 FROM users WHERE id=$1 AND company_id=$2 AND status='active' AND role IN ('owner','admin') AND NOT coalesce(must_change_password,false)",[link.pos_user_id,row.company_id])).rowCount)throw Error('Inhaberfreigabe der Kasse prüfen');
  const items=(await c.query('SELECT product_id,quantity FROM order_items WHERE order_id=$1 ORDER BY product_id',[row.order_id])).rows.map(i=>({productCode:String(i.product_id),quantity:Number(i.quantity)}));
  if(link.consumption_mode==='lifecycle'){
   await kitchenAction(ai,{id:link.account_id,role:'restaurant'},{requestKey:key(row.id,'accept'),orderId:'pos:'+row.order_id,action:'accept',items,reason:''},link);
   await kitchenAction(ai,{id:link.account_id,role:'restaurant'},{requestKey:key(row.id,'start'),orderId:'pos:'+row.order_id,action:'start',reason:''},link);
  }else await ingestSale(link,{eventId:'pos:'+row.order_id,type:'sale',items});
  await c.query("UPDATE pos_offline_sales SET stock_state='applied',stock_error=NULL WHERE id=$1",[row.id]);await c.query('COMMIT');
 }catch(e){await c.query('ROLLBACK');await pos.query("UPDATE pos_offline_sales SET stock_state=$2,stock_error=$3 WHERE id=$1",[row.id,e.status>=400&&e.status<500?'conflict':'pending',String(e.message).slice(0,500)])}finally{c.release()}}
}
