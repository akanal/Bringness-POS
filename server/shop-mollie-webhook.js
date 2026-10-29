// Mollie webhooks carry an ID, not proof of payment. Never mark paid from this body.
// The HTTP handler must apply authentication/abuse controls and invoke server-side
// provider reconciliation; this module intentionally exposes no route.
export function parseShopMollieWebhook(body){
 if(typeof body!=='string'||body.length>2048)throw Error('MOLLIE_WEBHOOK_BODY_INVALID');
 const params=new URLSearchParams(body);
 const keys=[...params.keys()];
 if(keys.length!==1||keys[0]!=='id')throw Error('MOLLIE_WEBHOOK_FIELDS_INVALID');
 const ids=params.getAll('id');
 if(ids.length!==1||!/^tr_[A-Za-z0-9]+$/.test(ids[0]))throw Error('MOLLIE_WEBHOOK_REFERENCE_INVALID');
 return Object.freeze({providerReference:ids[0]});
}
export async function findShopPaymentByProviderReference(pool,providerReference){
 if(typeof providerReference!=='string'||!/^tr_[A-Za-z0-9]+$/.test(providerReference))throw Error('MOLLIE_WEBHOOK_REFERENCE_INVALID');
 const result=await pool.query('SELECT order_id,company_id FROM shop_payment_ledger WHERE provider_reference=$1',[providerReference]);
 if(result.rows.length!==1)throw Error('MOLLIE_WEBHOOK_PAYMENT_NOT_FOUND');
 return {orderId:result.rows[0].order_id,companyId:result.rows[0].company_id};
}
