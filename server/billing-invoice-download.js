import {configuredIdriveDocumentStore} from './idrive-document-store.js';
import {storedBillingInvoice} from './billing-invoice-storage.js';
import {invoicePdf} from './billing-mail.js';
// Route authentication and company-scoped lookup precede this adapter.
export function createBillingInvoiceDownload(pool,{env=process.env,getStore=()=>configuredIdriveDocumentStore(env)}={}){
 let pending;
 return async z=>{
  if(!pending)pending=Promise.resolve().then(getStore).catch(error=>{pending=null;throw error;});
  return storedBillingInvoice(pool,await pending,z,env,invoicePdf);
 };
}
