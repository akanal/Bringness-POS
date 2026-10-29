import {reconcileShopPayment} from './shop-payment-provider-sync.js';
import {issueVerifiedArchivedShopDocument} from './shop-document-safe-issue.js';

// Server-only integration boundary. The caller must authenticate tenant ownership,
// load immutable invoice details from the order database, and use server-side provider credentials.
// Do not expose this function directly as an HTTP endpoint.
export async function reconcileAndIssueShopInvoice({pool,orderId,companyId,fetchProviderPayment,loadInvoiceContent,year}){
 if(!pool||typeof fetchProviderPayment!=='function'||typeof loadInvoiceContent!=='function')throw Error('SHOP_INVOICE_DEPENDENCIES_REQUIRED');
 if(!Number.isSafeInteger(year)||year<2000||year>9999)throw Error('SHOP_INVOICE_YEAR_INVALID');
 const payment=await reconcileShopPayment({pool,orderId,companyId,fetchProviderPayment});
 if(payment?.snapshot?.status!=='paid')throw Error('SHOP_INVOICE_PAYMENT_NOT_CONFIRMED');
 // Invoice fields must be loaded from trusted persisted order records, never webhook input.
 const content=await loadInvoiceContent({orderId,companyId});
 return issueVerifiedArchivedShopDocument(pool,{companyId,orderId,year,kind:'invoice',content});
}
