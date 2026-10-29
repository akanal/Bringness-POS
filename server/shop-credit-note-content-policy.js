import {assessShopCreditNote} from './shop-credit-note-policy.js';
// Isolated draft check; does not create a tax document or trigger a refund.
export function validateShopCreditNoteContent({snapshot,refundId,amountCents,originalInvoice,creditNote}){
 if(!originalInvoice||typeof originalInvoice!=='object'||!originalInvoice.id||!Number.isSafeInteger(originalInvoice.totalCents)||originalInvoice.totalCents<=0)throw Error('SHOP_CREDIT_NOTE_INVOICE_INVALID');
 const eligibility=assessShopCreditNote({snapshot,refundId,amountCents,originalInvoiceId:originalInvoice.id});
 if(!creditNote||typeof creditNote!=='object'||Array.isArray(creditNote))throw Error('SHOP_CREDIT_NOTE_CONTENT_INVALID');
 if(creditNote.originalInvoiceId!==originalInvoice.id||creditNote.refundId!==refundId)throw Error('SHOP_CREDIT_NOTE_REFERENCE_MISMATCH');
 if(creditNote.currency!=='EUR'||creditNote.amountCents!==amountCents||amountCents>originalInvoice.totalCents)throw Error('SHOP_CREDIT_NOTE_AMOUNT_MISMATCH');
 if(typeof creditNote.reason!=='string'||!creditNote.reason.trim()||creditNote.reason.length>500)throw Error('SHOP_CREDIT_NOTE_REASON_REQUIRED');
 if(typeof creditNote.issueDate!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(creditNote.issueDate)||Number.isNaN(Date.parse(creditNote.issueDate))||new Date(creditNote.issueDate).toISOString().slice(0,10)!==creditNote.issueDate)throw Error('SHOP_CREDIT_NOTE_DATE_INVALID');
 return Object.freeze({...eligibility,issueDate:creditNote.issueDate,reason:creditNote.reason});
}
