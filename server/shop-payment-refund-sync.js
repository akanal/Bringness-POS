import {verifyShopProviderRefund} from './shop-payment-refund-check.js';
import {recordShopPaymentEvent} from './shop-payment-ledger-pg.js';
// Not a refund initiation endpoint. Only reconcile a refund already completed
// by the provider. Provider data must be fetched using server-side credentials.
export async function reconcileShopRefund({pool,orderId,companyId,refundId,fetchProviderRefund,fetchProviderPayment}){
 if(typeof fetchProviderRefund!=='function'||typeof fetchProviderPayment!=='function')throw Error('REFUND_PROVIDER_ADAPTER_REQUIRED');
 if(typeof refundId!=='string'||!/^re_[A-Za-z0-9]+$/.test(refundId))throw Error('REFUND_REFERENCE_INVALID');
 const result=await pool.query('SELECT provider_reference,currency FROM shop_payment_ledger WHERE order_id=$1 AND company_id=$2',[orderId,companyId]);
 const row=result.rows[0];
 if(!row||!row.provider_reference)throw Error('REFUND_PAYMENT_NOT_FOUND');
 const providerRefund=await fetchProviderRefund(row.provider_reference,refundId);
 // Mollie refunds need not carry payment metadata. Resolve the order using
 // the separately fetched parent payment, not an untrusted refund field.
 const payment=await fetchProviderPayment(row.provider_reference);
 if(payment?.id!==row.provider_reference||payment?.orderId!==orderId||payment?.currency!==row.currency)throw Error('REFUND_PARENT_PAYMENT_MISMATCH');
 if(providerRefund?.orderId!==undefined&&providerRefund.orderId!==orderId)throw Error('REFUND_ORDER_MISMATCH');
 const verifiedRefund={...providerRefund,orderId:payment.orderId};
 const event=verifyShopProviderRefund({orderId,providerReference:row.provider_reference,currency:row.currency},verifiedRefund);
 if(event.id!==refundId)throw Error('REFUND_REFERENCE_MISMATCH');
 return recordShopPaymentEvent(pool,{orderId,companyId,event});
}
