// Pure, isolated payment event accounting. No provider or database integration is enabled.
// Callers must independently authenticate provider callbacks and persist the result atomically.
export function applyShopPaymentEvent(snapshot,event){
 if(!snapshot||!Number.isSafeInteger(snapshot.amountCents)||snapshot.amountCents<=0||!Array.isArray(snapshot.events))throw Error('PAYMENT_SNAPSHOT_INVALID');
 if(!event||typeof event.id!=='string'||event.id.length<1||event.id.length>160||!['paid','refund'].includes(event.kind)||event.verified!==true)throw Error('PAYMENT_EVENT_UNVERIFIED');
 if(!Number.isSafeInteger(event.amountCents)||event.amountCents<=0)throw Error('PAYMENT_EVENT_AMOUNT_INVALID');
 const previous=snapshot.events.find(e=>e.id===event.id);
 if(previous){if(previous.kind!==event.kind||previous.amountCents!==event.amountCents)throw Error('PAYMENT_EVENT_CONFLICT');return {snapshot,replay:true};}
 const paid=snapshot.events.filter(e=>e.kind==='paid').reduce((sum,e)=>sum+e.amountCents,0);
 const refunded=snapshot.events.filter(e=>e.kind==='refund').reduce((sum,e)=>sum+e.amountCents,0);
 if(event.kind==='paid'&&(paid!==0||event.amountCents!==snapshot.amountCents))throw Error('PAYMENT_AMOUNT_MISMATCH');
 if(event.kind==='refund'&&(paid!==snapshot.amountCents||event.amountCents>paid-refunded))throw Error('PAYMENT_REFUND_EXCEEDS_PAID');
 const events=[...snapshot.events,{id:event.id,kind:event.kind,amountCents:event.amountCents}];
 const totalRefunded=refunded+(event.kind==='refund'?event.amountCents:0);
 return {snapshot:{amountCents:snapshot.amountCents,events,status:event.kind==='paid'?'paid':totalRefunded===paid?'refunded':'partially_refunded'},replay:false};
}
