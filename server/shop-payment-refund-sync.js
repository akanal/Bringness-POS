import {verifyShopProviderRefund} from './shop-payment-refund-check.js';
import {recordShopPaymentEvent} from './shop-payment-ledger-pg.js';
// Not a refund initiation endpoint. Only reconcile a refund already completed
// by the provider. Provider data must be fetched using server-side credentials.
export async function reconcileShopRefund({pool,orderId,companyId,refundId,fetchProviderRefund}){
 if(typeof fetchProviderRefund!=='function')throw Error('REFUND_PROVIDER_ADAPTER_REQUIRED');
 if(typeof refundId!=='string'||!/^re_[A-Za-z0-9]+$/.test(refundId))throw Error('REFUND_REFERENCE_INVALID');
 const result=await pool.query('SELECT provider_reference,currency FROM shop_payment_ledger WHERE order_id=$1 AND company_id=$2',[orderId,companyId]);
 const row=result.rows[0];
 if(!row||!row.provider_reference)throw Error('REFUND_PAYMENT_NOT_FOUND');
 const providerRefund=await fetchProviderRefund(row.provider_reference,refundId);
 const event=verifyShopProviderRefund({orderId,providerReference:row.provider_reference,currency:row.currency},providerRefund);
 if(event.id!==refundId)throw Error('REFUND_REFERENCE_MISMATCH');
 return recordShopPaymentEvent(pool,{orderId,companyId,event});
}
