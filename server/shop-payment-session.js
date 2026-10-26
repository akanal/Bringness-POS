import {shopActor,sessionHash,shopError} from './shop-account.js';
import {uuid} from './shop-drafts.js';
import {orderProduct} from './shop-order-product.js';
import {safeCheckoutUrl} from './shop-provider-proof.js';
import {dispatchPreparedShopCheckout} from './shop-checkout-dispatch.js';
import {reconcileShopTestPayment} from './shop-payment-status.js';

// Every customer operation first binds the order to the currently active account.
async function accountOrder(pool,{token,id}){
 if(!uuid(id))throw shopError('INVALID_REQUEST');
 const hash=sessionHash(token),db=await pool.connect();
 try{
  await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  await db.query("SET LOCAL statement_timeout='5s'");
  const actor=await shopActor(db,hash);
  const order=(await db.query('SELECT * FROM shop_checkout_orders WHERE company_id=$1 AND id=$2',[actor.company_id,id])).rows[0];
  if(!order)throw shopError('CHECKOUT_NOT_FOUND');
  if(order.provider_mode&&order.provider_mode!=='test')throw shopError('PAYMENT_MODE_MISMATCH');
  orderProduct(order.snapshot);
  await db.query('COMMIT');return {order,hash};
 }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
}

export async function readShopPaymentSession(pool,request){
 const {order,hash}=await accountOrder(pool,request);
 return {id:order.id,status:order.status,mode:'test',product:orderProduct(order.snapshot),
  canStart:order.status==='prepared'&&order.session_hash===hash&&!order.dispatch_started_at&&!order.provider_payment_id,
  checkoutUrl:order.status==='open'&&order.provider_mode==='test'&&safeCheckoutUrl(order.checkout_url)?order.checkout_url:null,
  canRefresh:order.provider_mode==='test'&&Boolean(order.provider_payment_id),
  invoiceIssued:false,canActivate:false};
}

export async function startShopPaymentSession(pool,request,{submit}){
 const {order,hash}=await accountOrder(pool,request);
 // Dispatch rechecks the saved session under its transaction locks. Never
 // dispatch using another owner's saved identity, including within one company.
 if(order.session_hash!==hash)throw shopError('PAYMENT_SESSION_CHANGED');
 if(order.status==='open')return readShopPaymentSession(pool,request);
 if(order.status!=='prepared')throw shopError('CHECKOUT_PENDING');
 await dispatchPreparedShopCheckout(pool,{id:order.id,submit});
 return readShopPaymentSession(pool,request);
}

export async function refreshShopPaymentSession(pool,request,{fetchPayment}){
 const {order}=await accountOrder(pool,request);
 if(order.provider_mode!=='test'||!order.provider_payment_id)throw shopError('CHECKOUT_PENDING');
 await reconcileShopTestPayment(pool,{id:order.id,fetchPayment});
 // Reauthorize after the external request before exposing any fresh result.
 return readShopPaymentSession(pool,request);
}
