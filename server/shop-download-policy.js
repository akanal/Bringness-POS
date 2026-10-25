import {supportedDownloadBuyer,supportedDownloadInvoiceDate,downloadInvoiceDate} from './shop-download-invoice-readiness.js';
import {shopError} from './shop-account.js';
const string=(v,max=500)=>typeof v==='string'&&v.trim().length>=2&&v.length<=max&&!/[\u0000-\u001f\u007f]/.test(v);
export function downloadSeller(value){
 if(!value||!['name','street','postalCode','city','taxId'].every(k=>string(value[k]))||value.country!=='DE')throw shopError('SELLER_PROFILE_INCOMPLETE');
 return Object.freeze(Object.fromEntries(['name','street','postalCode','city','taxId','country'].map(k=>[k,value[k].trim()])));
}
export function downloadProduct(s){
 if(s?.productId!=='pos-download'||s.planCode!=='download_license'||s.period!=='once'||s.currency!=='EUR')throw shopError('FULFILMENT_UNSUPPORTED');
 if(!['netCents','vatCents','grossCents'].every(k=>Number.isSafeInteger(s[k])&&s[k]>=0&&s[k]<=2147483647)||s.netCents<=0||s.netCents+s.vatCents!==s.grossCents||Math.round(s.netCents*19/100)!==s.vatCents)throw shopError('FULFILMENT_MISMATCH');
 return Object.fromEntries(['productId','planCode','period','currency','netCents','vatCents','grossCents'].map(k=>[k,s[k]]));
}
export function downloadSnapshot(order){
 const product=downloadProduct(order.snapshot),b=order.billing_snapshot;
 if(!supportedDownloadBuyer(b))throw shopError('BUYER_PROFILE_UNSUPPORTED');
 return {product,buyer:Object.fromEntries(['company_name','street','postal_code','city','country'].map(k=>[k,b[k]]))};
}
export function berlinInvoiceDate(value){const date=downloadInvoiceDate(value);if(!date)throw shopError('INVALID_INVOICE_DATE');return date;}
// Conservative domestic B2B PDF transition gate. No turnover assumption for 2027,
// no reverse-charge/foreign/public-sector/structured-invoice implementation claimed.
export function allowDownloadPdf({date,consent}){
 if(!supportedDownloadInvoiceDate(date)||consent!==true)throw shopError('INVOICE_FORMAT_NOT_READY');
}
