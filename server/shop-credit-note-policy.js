// Pure eligibility policy; does not issue fiscal documents or allocate invoice numbers.
// A credit note must be based on an already recorded, provider-verified refund.
export function assessShopCreditNote({snapshot,refundId,amountCents,originalInvoiceId}){
 if(!snapshot||!Array.isArray(snapshot.events)||!Number.isSafeInteger(snapshot.amountCents)||snapshot.amountCents<=0)throw Error('CREDIT_NOTE_SNAPSHOT_INVALID');
 if(typeof originalInvoiceId!=='string'||!originalInvoiceId.trim()||originalInvoiceId.length>160)throw Error('CREDIT_NOTE_INVOICE_REQUIRED');
 if(typeof refundId!=='string'||!/^re_[A-Za-z0-9]+$/.test(refundId))throw Error('CREDIT_NOTE_REFUND_ID_INVALID');
 if(!Number.isSafeInteger(amountCents)||amountCents<=0)throw Error('CREDIT_NOTE_AMOUNT_INVALID');
 const matches=snapshot.events.filter(e=>e.id===refundId);
 if(matches.length!==1||matches[0].kind!=='refund'||matches[0].amountCents!==amountCents)throw Error('CREDIT_NOTE_REFUND_NOT_RECORDED');
 const paid=snapshot.events.filter(e=>e.kind==='paid').reduce((sum,e)=>sum+e.amountCents,0);
 const refunded=snapshot.events.filter(e=>e.kind==='refund').reduce((sum,e)=>sum+e.amountCents,0);
 if(!Number.isSafeInteger(paid)||!Number.isSafeInteger(refunded)||paid!==snapshot.amountCents||refunded>paid)throw Error('CREDIT_NOTE_LEDGER_INVALID');
 return Object.freeze({refundId,originalInvoiceId,amountCents,currency:'EUR',eligible:true});
}
