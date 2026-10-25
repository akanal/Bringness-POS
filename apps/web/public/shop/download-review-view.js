import {checkoutUuid} from './checkout-state.js';
const invalid=()=>{throw Object.assign(Error('INVALID_RESPONSE'),{code:'INVALID_RESPONSE'});};
const text=value=>typeof value==='string'&&value.trim().length>=2&&value.length<=500&&!/[\u0000-\u001f\u007f]/.test(value);
export function downloadReviewLocation(hash){
 const p=new URLSearchParams(String(hash).replace(/^#/,''));if([...p.keys()].some(k=>k!=='checkout')||p.getAll('checkout').length!==1||!checkoutUuid(p.get('checkout')))return null;return p.get('checkout');
}
export const downloadReviewHref=id=>{if(!checkoutUuid(id))throw Error('INVALID_REQUEST');return '/shop/download-review.html#checkout='+id;};
export function downloadReviewData(value,id){
 const s=value?.seller,b=value?.buyer,p=value?.product;
 if(!checkoutUuid(id)||value?.id!==id||value.canPay!==false||value.canActivate!==false||value.checkoutConnected!==false||!s||!['name','street','postalCode','city','taxId'].every(k=>text(s[k]))||s.country!=='DE'||!b||!['company_name','street','postal_code','city','country'].every(k=>text(b[k]))||!['de','deutschland','germany'].includes(b.country.trim().toLowerCase()))return invalid();
 if(p?.productId!=='pos-download'||p.planCode!=='download_license'||p.period!=='once'||p.currency!=='EUR'||!['netCents','vatCents','grossCents'].every(k=>Number.isSafeInteger(p[k])&&p[k]>=0&&p[k]<=2147483647)||p.netCents<=0||p.netCents+p.vatCents!==p.grossCents||Math.round(p.netCents*19/100)!==p.vatCents)return invalid();return {seller:s,buyer:b,product:p};
}
export function downloadInvoiceViewData(value,id){
 const s=value?.snapshot;
 if(value?.id!==id||value.kind!=='invoice_preview'||value.invoiceDelivered!==false||!s||s.checkoutId!==id||s.version!==1||s.quantity!==1||s.vatRate!==19||!text(s.description)||!/^BN-\d{4}-\d{6,20}$/.test(s.invoiceNumber)||![s.invoiceDate,s.serviceDate].every(d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(Date.parse(d))&&new Date(d).toISOString().slice(0,10)===d)||s.serviceDate>s.invoiceDate||s.invoiceNumber.slice(3,7)!==s.invoiceDate.slice(0,4))return invalid();
 return {...downloadReviewData({...value,...s,id},id),invoiceNumber:s.invoiceNumber,invoiceDate:s.invoiceDate,serviceDate:s.serviceDate,description:s.description};
}
