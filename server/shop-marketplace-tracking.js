import crypto from 'node:crypto';
import {marketplaceTransaction,requireMarketplaceSeller} from './shop-marketplace.js';
import {marketTrackingCommand} from '../apps/web/public/shop/market-tracking-policy.js';
import {shopError} from './shop-account.js';
const fail=code=>{throw shopError(code);};
export async function updateMarketplaceTracking(pool,{token,command}){
 const c=marketTrackingCommand(command),digest=crypto.createHash('sha256').update(JSON.stringify({kind:'order-tracking',orderId:c.orderId,expectedRevision:c.expectedRevision,tracking:c.tracking})).digest('hex');
 return marketplaceTransaction(pool,token,async(db,company,user)=>{
  await requireMarketplaceSeller(db,company,user);
  const previous=(await db.query('SELECT digest,result FROM shop_market_commands WHERE company_id=$1 AND request_id=$2',[company,c.requestId])).rows[0];
  if(previous){if(previous.digest!==digest)fail('REQUEST_CONFLICT');return {...previous.result,replay:true};}
  const order=(await db.query('SELECT * FROM shop_market_seller_orders WHERE id=$1 AND company_id=$2 FOR UPDATE',[c.orderId,company])).rows[0];if(!order)fail('ORDER_NOT_FOUND');
  const state=(await db.query('SELECT status FROM shop_market_order_state WHERE order_id=$1 FOR UPDATE',[order.id])).rows[0];
  if(order.shipment.method!=='shipping'||state?.status!=='shipped')fail('TRACKING_NOT_AVAILABLE');
  const old=(await db.query('SELECT revision FROM shop_market_tracking WHERE order_id=$1 FOR UPDATE',[order.id])).rows[0];if((old?.revision??0)!==c.expectedRevision)fail('REVISION_CONFLICT');
  const revision=c.expectedRevision+1;
  const saved=(await db.query(`INSERT INTO shop_market_tracking(order_id,revision,document) VALUES($1,$2,$3) ON CONFLICT(order_id) DO UPDATE SET revision=excluded.revision,document=excluded.document,updated_at=clock_timestamp() RETURNING updated_at`,[order.id,revision,c.tracking])).rows[0];
  await db.query('INSERT INTO shop_market_tracking_events(order_id,revision,document,actor_id) VALUES($1,$2,$3,$4)',[order.id,revision,c.tracking,user]);
  const result={requestId:c.requestId,orderId:order.id,revision,tracking:c.tracking,updatedAt:new Date(saved.updated_at).toISOString(),canPay:false,paymentStatus:'unpaid',replay:false};
  await db.query('INSERT INTO shop_market_commands VALUES($1,$2,$3,$4)',[company,c.requestId,digest,result]);return result;
 });
}
