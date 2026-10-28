import crypto from 'node:crypto';
import {marketplaceTransaction as tx,requireMarketplaceSeller as approved} from './shop-marketplace.js';
import {validateMarketOrderCommand,nextMarketOrder,marketOrderActions} from '../apps/web/public/shop/market-order-policy.js';
import {marketInteger} from '../apps/web/public/shop/market-policy.js';
import {shopError} from './shop-account.js';
const fail=code=>{throw shopError(code);};
const flags={canPay:false,paymentStatus:'unpaid'};
const select=`SELECT o.*,COALESCE(t.status,'received') AS current_status,COALESCE(t.revision,0) AS revision,COALESCE(t.updated_at,o.created_at) AS updated_at,k.document AS tracking,COALESCE(k.revision,0) AS tracking_revision,k.updated_at AS tracking_updated_at FROM shop_market_seller_orders o LEFT JOIN shop_market_order_state t ON t.order_id=o.id LEFT JOIN shop_market_tracking k ON k.order_id=o.id`;
function present(r,seller){return {id:r.id,...(seller?r.snapshot:{reference:r.snapshot.reference,lines:r.snapshot.lines,netCents:r.snapshot.netCents,vatCents:r.snapshot.vatCents,grossCents:r.snapshot.grossCents,currency:r.snapshot.currency}),...r.shipment,status:r.current_status,revision:r.revision,tracking:r.tracking,trackingRevision:r.tracking_revision,trackingUpdatedAt:r.tracking_updated_at?new Date(r.tracking_updated_at).toISOString():null,createdAt:new Date(r.created_at).toISOString(),updatedAt:new Date(r.updated_at).toISOString(),...(seller?{actions:marketOrderActions(r.current_status,r.shipment.method)}:{}),...flags};}
export async function marketplaceInbox(pool,{token}){return tx(pool,token,async(db,company,user)=>{await approved(db,company,user);const rows=(await db.query(select+' WHERE o.company_id=$1 ORDER BY o.created_at DESC,o.id LIMIT 50',[company])).rows;return {orders:rows.map(r=>present(r,true)),limit:50,...flags};});}
export async function marketplaceBuyerOrders(pool,{token}){return tx(pool,token,async(db,company)=>{const rows=(await db.query(select+' JOIN shop_market_orders b ON b.order_id=o.id WHERE b.buyer_company_id=$1 ORDER BY o.created_at DESC,o.id LIMIT 50',[company])).rows;return {orders:rows.map(r=>present(r,false)),limit:50,...flags};});}
export async function transitionMarketplaceOrder(pool,{token,command}){
 const c=validateMarketOrderCommand(command),digest=crypto.createHash('sha256').update(JSON.stringify({kind:'order-status',orderId:c.orderId,expectedRevision:c.expectedRevision,action:c.action})).digest('hex');
 return tx(pool,token,async(db,company,user)=>{
 await approved(db,company,user);
 const receipt=(await db.query('SELECT digest,result FROM shop_market_commands WHERE company_id=$1 AND request_id=$2',[company,c.requestId])).rows[0];
 if(receipt){if(receipt.digest!==digest)fail('REQUEST_CONFLICT');return {...receipt.result,replay:true};}
 const order=(await db.query('SELECT * FROM shop_market_seller_orders WHERE id=$1 AND company_id=$2 FOR UPDATE',[c.orderId,company])).rows[0];if(!order)fail('ORDER_NOT_FOUND');
 const state=(await db.query('SELECT * FROM shop_market_order_state WHERE order_id=$1 FOR UPDATE',[order.id])).rows[0],revision=state?.revision??0,status=state?.status??'received';
 if(c.expectedRevision!==revision)fail('REVISION_CONFLICT');
 const next=nextMarketOrder(status,order.shipment.method,c.action);
 if(['rejected','cancelled'].includes(next)){
 const allocations=(await db.query('SELECT offer_id,sku,quantity FROM shop_market_allocations WHERE order_id=$1 ORDER BY offer_id,sku',[order.id])).rows;
 if(!allocations.length)fail('STOCK_RESTORE_REQUIRED');
 const grouped=new Map();for(const a of allocations){if(!grouped.has(a.offer_id))grouped.set(a.offer_id,[]);grouped.get(a.offer_id).push(a);}
 for(const [id,items]of grouped){const r=(await db.query('SELECT document FROM shop_market_publications WHERE id=$1 AND company_id=$2 FOR UPDATE',[id,company])).rows[0];if(!r)fail('STOCK_RESTORE_REQUIRED');const document=structuredClone(r.document);
 for(const a of items){const v=document.variants.find(v=>v.sku===a.sku);if(!v||!Number.isSafeInteger(v.stock)||v.stock+a.quantity>1000000)fail('STOCK_RESTORE_REQUIRED');marketInteger(a.quantity,999);v.stock+=a.quantity;}
 await db.query('UPDATE shop_market_publications SET document=$2,revision=revision+1,updated_at=clock_timestamp() WHERE id=$1',[id,document]);}
 }
 const saved=(await db.query(`INSERT INTO shop_market_order_state(order_id,status,revision) VALUES($1,$2,$3) ON CONFLICT(order_id) DO UPDATE SET status=excluded.status,revision=excluded.revision,updated_at=clock_timestamp() RETURNING updated_at`,[order.id,next,revision+1])).rows[0];
 await db.query('INSERT INTO shop_market_order_events(order_id,revision,status,actor_id) VALUES($1,$2,$3,$4)',[order.id,revision+1,next,user]);
 const result={requestId:c.requestId,orderId:order.id,status:next,revision:revision+1,updatedAt:new Date(saved.updated_at).toISOString(),replay:false,...flags};
 await db.query('INSERT INTO shop_market_commands VALUES($1,$2,$3,$4)',[company,c.requestId,digest,result]);return result;
 });
}
