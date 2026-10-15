// Validate a provider response before any billing entitlement is activated.
export function paymentMatchesCheckout(payment,expected){
 if(!payment||!expected||payment.status!=='paid')return false;
 if(payment.id!==expected.paymentId)return false;
 if(payment.amount?.currency!=='EUR')return false;
 const value=payment.amount?.value;
 if(typeof value!=='string'||!/^\d+\.\d{2}$/.test(value))return false;
 const [whole,cents]=value.split('.');
 const actual=Number(whole)*100+Number(cents);
 if(!Number.isSafeInteger(actual)||actual!==expected.grossCents)return false;
 if(payment.metadata?.checkoutId!==expected.checkoutId)return false;
 if(payment.metadata?.companyId!==expected.companyId)return false;
 return Boolean(expected.checkoutId&&expected.companyId);
}
