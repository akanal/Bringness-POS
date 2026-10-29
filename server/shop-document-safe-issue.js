import {issueShopDocumentRecord} from './shop-document-issue-pg.js';
import {validateShopInvoiceContent} from './shop-invoice-content-policy.js';
import {validateShopCreditNoteContent} from './shop-credit-note-content-policy.js';

// Isolated server-side entry point. Caller must authenticate company ownership,
// verify provider state upstream, and supply the original issued document.
// Do not mount this function directly as an HTTP endpoint.
export async function issueVerifiedArchivedShopDocument(pool,options){
 if(!options||typeof options!=='object'||Array.isArray(options))throw Error('SHOP_DOCUMENT_OPTIONS_INVALID');
 // Validate before opening a transaction; never trust caller-provided bypass flags.
 if(options.kind==='invoice')validateShopInvoiceContent(options.content);
 else if(options.kind==='credit_note')validateShopCreditNoteContent(options.content);
 else throw Error('SHOP_DOCUMENT_ISSUE_INVALID');
 return issueShopDocumentRecord(pool,{...options,requirePaid:true,archive:true});
}
