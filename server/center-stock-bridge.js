import crypto from 'node:crypto';
function commandId(orderId,action){const hex=crypto.createHash('sha256').update('center:'+orderId+':'+action).digest('hex');return hex.slice(0,8)+'-'+hex.slice(8,12)+'-4'+hex.slice(13,16)+'-8'+hex.slice(17,20)+'-'+hex.slice(20,32);}
export async function applyCenterStock(client,orderId,restaurantId,action,dependencies){
 const schema=(await client.query("SELECT to_regclass('pos_stock_links') relation")).rows[0];if(!schema?.relation)throw Error('POS_STOCK_SCHEMA_MISSING');
 const link=(await client.query('SELECT * FROM pos_stock_links WHERE restaurant_id=$1 AND active FOR SHARE',[restaurantId])).rows[0];if(!link)return {linked:false};
 const runtime=dependencies||{stockPool:(await import('./ai-database.js')).aiPool(),kitchenAction:(await import('./ai-stock-lifecycle.js')).kitchenAction};
 const connector=(await runtime.stockPool.query(`SELECT c.* FROM ai_connectors c JOIN ai_accounts a ON a.id=c.account_id
 WHERE c.id=$1 AND c.account_id=$2 AND c.pos_restaurant_id=$3 AND c.active AND c.kind='pos'
 AND c.consumption_mode='lifecycle' AND a.status='active'`,[link.connector_id,link.account_id,restaurantId])).rows[0];if(!connector)throw Error('STOCK_CONNECTOR_NOT_READY');
 const owner=(await client.query("SELECT id FROM users WHERE id=$1 AND company_id=$2 AND status='active' AND role IN ('owner','admin') AND NOT coalesce(must_change_password,false)",[connector.pos_user_id,connector.pos_company_id])).rows[0];if(!owner)throw Error('STOCK_OWNER_NOT_AUTHORIZED');
 const items=(await client.query('SELECT product_id,quantity FROM order_items WHERE order_id=$1 AND quantity>0 ORDER BY product_id',[orderId])).rows.map(i=>({productCode:String(i.product_id||''),quantity:Number(i.quantity)}));
 const id=commandId(orderId,action),target=action==='accept'?'kitchen':'preparing';
 // Stable UUID survives a POS rollback after AI committed. Replaying it is safe.
 await runtime.kitchenAction(runtime.stockPool,{id:link.account_id,role:'restaurant'},{requestKey:id,orderId:'pos:'+orderId,action,...(action==='accept'?{items}:{})},connector);
 await client.query(`INSERT INTO pos_stock_commands(id,order_id,connector_id,account_id,actor_id,action,target_status,items,state,applied_at)
 VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,'applied',now()) ON CONFLICT(id) DO NOTHING`,[id,orderId,link.connector_id,link.account_id,owner.id,action,target,JSON.stringify(items)]);
 return {linked:true,commandId:id};
}
