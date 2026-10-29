import {issueShopDocumentRecord} from './shop-document-issue-pg.js';

// Isolated server-side entry point. Caller must authenticate company ownership,
// validate the tax document content, and verify the payment provider upstream.
// Do not mount this function directly as an HTTP endpoint.
export async function issueVerifiedArchivedShopDocument(pool,options){
 if(!options||typeof options!=='object'||Array.isArray(options))throw Error('SHOP_DOCUMENT_OPTIONS_INVALID');
 // Force safeguards regardless of caller-supplied flags.
 return issueShopDocumentRecord(pool,{...options,requirePaid:true,archive:true});
}
