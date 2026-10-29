import {reconcileShopRefund} from './shop-payment-refund-sync.js';
// Explicitly unmounted. Mollie payment webhooks do not prove refunds;
// only an authenticated server job should supply refund IDs from Mollie.
export async function reconcileShopRefundNotifications({pool,orderId,companyId,fetchProviderRefund,listProviderRefunds}){
 if(typeof listProviderRefunds!=='function'||typeof fetchProviderRefund!=='function')throw Error('REFUND_PROVIDER_ADAPTER_REQUIRED');
 const result=await pool.query('SELECT provider_reference FROM shop_payment_ledger WHERE order_id=$1 AND company_id=$2',[orderId,companyId]);
 const paymentId=result.rows[0]?.provider_reference;
 if(!paymentId)throw Error('REFUND_PAYMENT_NOT_FOUND');
 const refunds=await listProviderRefunds(paymentId);
 if(!Array.isArray(refunds)||refunds.length>100)throw Error('REFUND_PROVIDER_RESPONSE_INVALID');
 const seen=new Set();const outcomes=[];
 for(const refund of refunds){
  const id=refund?.id;
  if(typeof id!=='string'||!/^re_[A-Za-z0-9]+$/.test(id))throw Error('REFUND_REFERENCE_INVALID');
  if(seen.has(id))continue;
  seen.add(id);
  if(refund.status!=='refunded')continue;
  outcomes.push(await reconcileShopRefund({pool,orderId,companyId,refundId:id,fetchProviderRefund}));
 }
 return outcomes;
}
