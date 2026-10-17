import {billingPaymentMatches} from './billing-payment-validation.js';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function recurringBillingSource(db,payment){
 if(!payment||typeof payment.subscriptionId!=='string'||!/^sub_[A-Za-z0-9]+$/.test(payment.subscriptionId)||typeof payment.customerId!=='string'||!/^cst_[A-Za-z0-9]+$/.test(payment.customerId)||!uuid.test(payment.metadata?.companyId||'')||typeof payment.metadata?.planCode!=='string')return null;
 const source=(await db.query("SELECT bt.* FROM billing_transactions bt JOIN billing_plans bp ON bp.id=bt.plan_id WHERE bt.mollie_subscription_id=$1 AND bt.mollie_customer_id=$2 AND bt.company_id=$3 AND bp.code=$4 AND bp.billing_type='monthly' AND bt.paid_at IS NOT NULL ORDER BY bt.paid_at DESC,bt.id LIMIT 1 FOR SHARE OF bt,bp",[payment.subscriptionId,payment.customerId,payment.metadata.companyId,payment.metadata.planCode])).rows[0];
 if(!source||!billingPaymentMatches({...source,provider_payment_id:payment.id},payment))return null;return source;
}
