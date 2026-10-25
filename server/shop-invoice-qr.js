import {uuid} from './shop-drafts.js';
import {shopError} from './shop-account.js';

// Reference only: scanning never authenticates a user or proves payment.
// The existing review page requires an owner session and company-scoped reads.
export function shopInvoiceReviewUrl(publicOrigin,id){
 if(!uuid(id))throw shopError('INVALID_REQUEST');
 let origin;try{origin=new URL(publicOrigin);if(typeof publicOrigin!=='string'||origin.protocol!=='https:'||origin.origin!==publicOrigin||origin.username||origin.password||origin.port)throw Error();}catch{throw shopError('INVALID_PUBLIC_ORIGIN');}
 return origin.origin+'/shop/download-review.html#checkout='+id.toLowerCase();
}

export async function shopInvoiceQr(publicOrigin,id,{encoder}={}){
 const url=shopInvoiceReviewUrl(publicOrigin,id);
 try{
  if(!encoder)encoder=(await import('qrcode')).default;
  const qr=encoder.create(url,{errorCorrectionLevel:'M'}),size=qr.modules.size;
  if(!Number.isInteger(size)||size<21||size>177||qr.modules.data.length!==size*size)throw Error();
  const data=Array.from(qr.modules.data);if(data.some(v=>v!==0&&v!==1))throw Error();
  return {url,size,data,quietZone:4};
 }catch{throw shopError('INVOICE_QR_UNAVAILABLE');}
}
