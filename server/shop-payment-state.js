// Internal policy only: no payment provider, checkout, webhook or refund endpoint is enabled.
// Never infer a successful payment from a buyer or merchant UI command.
export const SHOP_PAYMENT_STATES=Object.freeze(['unpaid','pending','paid','failed','cancelled','partially_refunded','refunded']);
const allowed=Object.freeze({
 unpaid:{begin:'pending',cancel:'cancelled'},
 pending:{confirm:'paid',fail:'failed',cancel:'cancelled'},
 failed:{retry:'pending',cancel:'cancelled'},
 paid:{partial_refund:'partially_refunded',refund:'refunded'},
 partially_refunded:{partial_refund:'partially_refunded',refund:'refunded'},
 cancelled:{},refunded:{}
});
export function nextShopPaymentState(current,event,{verifiedProviderEvent=false}={}){
 if(!SHOP_PAYMENT_STATES.includes(current))throw Error('PAYMENT_STATE_INVALID');
 if(typeof event!=='string'||!Object.hasOwn(allowed[current],event))throw Error('PAYMENT_TRANSITION_INVALID');
 if(['confirm','partial_refund','refund'].includes(event)&&verifiedProviderEvent!==true)throw Error('PAYMENT_PROVIDER_CONFIRMATION_REQUIRED');
 return allowed[current][event];
}
export function assertShopPaymentAmount({amountCents,currency,orderId}){
 if(!Number.isSafeInteger(amountCents)||amountCents<=0)throw Error('PAYMENT_AMOUNT_INVALID');
 if(currency!=='EUR')throw Error('PAYMENT_CURRENCY_INVALID');
 if(typeof orderId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(orderId))throw Error('PAYMENT_ORDER_INVALID');
 return Object.freeze({amountCents,currency,orderId});
}
