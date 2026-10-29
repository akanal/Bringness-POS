import {reconcileShopRefund} from './shop-payment-refund-sync.js';
// Explicitly unmounted. Mollie payment webhooks do not prove refunds;
// only an authenticated server job should supply refund IDs from Mollie.
export async function reconcileShopRefundNotifications({pool,orderId,companyId,fetchProviderRefund,listProviderRefunds,fetchProviderPayment}){
 if(typeof listProviderRefunds!=='function'||typeof fetchProviderRefund!=='function'||typeof fetchProviderPayment!=='function')throw Error('REFUND_PROVIDER_ADAPTER_REQUIRED');
 const result=await pool.query('SELECT provider_reference FROM shop_payment_ledger WHERE order_id=$1 AND company_id=$2',[orderId,companyId]);
 const paymentId=result.rows[0]?.provider_reference;
 if(!paymentId)throw Error('REFUND_PAYMENT_NOT_FOUND');
 const refunds=await listProviderRefunds(paymentId);
 if(!Array.isArray(refunds)||refunds.length>100)throw Error('REFUND_PROVIDER_RESPONSE_INVALID');
 const seen=new Set();
 // Preflight the entire provider page so malformed later entries cannot cause
 // an earlier refund to be committed before validation fails.
 for(const refund of refunds){
  const id=refund?.id;
  if(typeof id!=='string'||!/^re_[A-Za-z0-9]+$/.test(id))throw Error('REFUND_REFERENCE_INVALID');
  if(typeof refund.status!=='string'||!['queued','pending','processing','refunded','failed','canceled'].includes(refund.status))throw Error('REFUND_STATUS_INVALID');
 }
 const outcomes=[];
 for(const refund of refunds){
  const id=refund?.id;
  if(typeof id!=='string'||!/^re_[A-Za-z0-9]+$/.test(id))throw Error('REFUND_REFERENCE_INVALID');
  if(seen.has(id))continue;
  seen.add(id);
  if(refund.status!=='refunded')continue;
  outcomes.push(await reconcileShopRefund({pool,orderId,companyId,refundId:id,fetchProviderRefund,fetchProviderPayment}));
 }
 return outcomes;
}
