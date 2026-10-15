// Validate the provider-fetched payment against the recorded transaction before any entitlement changes.
export function mollieBillingPaymentMatches(payment,transaction){
 if(!payment||!transaction||payment.id!==transaction.provider_payment_id)return false;
 if(payment.amount?.currency!==transaction.currency||payment.amount.currency!=='EUR')return false;
 const value=payment.amount?.value;
 if(typeof value!=='string'||!/^\d+\.\d{2}$/.test(value))return false;
 const [euros,cents]=value.split('.');
 const amount=Number(euros)*100+Number(cents);
 if(!Number.isSafeInteger(amount)||amount!==Number(transaction.amount_cents))return false;
 if(payment.metadata?.companyId!==transaction.company_id)return false;
 if(transaction.plan_code&&payment.metadata?.planCode!==transaction.plan_code)return false;
 return true;
}
