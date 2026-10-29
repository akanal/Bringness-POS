import {verifyShopProviderPayment} from './shop-payment-provider-check.js';
import {recordShopPaymentEvent} from './shop-payment-ledger-pg.js';

// Invoke only from an authenticated server-side job or provider notification handler.
// fetchProviderPayment must use server credentials and retrieve authoritative data.
// Never pass untrusted webhook fields as the provider payment response.
export async function reconcileShopPayment({pool,orderId,companyId,fetchProviderPayment}){
 if(typeof fetchProviderPayment!=='function')throw Error('PAYMENT_PROVIDER_ADAPTER_REQUIRED');
 const result=await pool.query('SELECT amount_cents,currency,provider_reference FROM shop_payment_ledger WHERE order_id=$1 AND company_id=$2',[orderId,companyId]);
 const row=result.rows[0];
 if(!row)throw Error('PAYMENT_ORDER_NOT_FOUND');
 if(!row.provider_reference)throw Error('PAYMENT_PROVIDER_NOT_BOUND');
 const amountCents=Number(row.amount_cents);
 if(!Number.isSafeInteger(amountCents)||amountCents<=0)throw Error('PAYMENT_AMOUNT_INVALID');
 const providerPayment=await fetchProviderPayment(row.provider_reference);
 const event=verifyShopProviderPayment({orderId,providerReference:row.provider_reference,amountCents,currency:row.currency},providerPayment);
 return recordShopPaymentEvent(pool,{orderId,companyId,event});
}
