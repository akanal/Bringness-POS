import {migrateShopInvoicePreviewArchive,archiveShopInvoicePreviewFile,readShopInvoicePreviewFile} from './shop-invoice-preview-archive.js';
import {migrateShopDownloadHistory,readShopDownloadHistory} from './shop-download-history.js';
import {renderShopDownloadInvoicePreviewPdf,shopDownloadInvoicePdfResponse} from './shop-download-invoice-pdf.js';
import {shopError} from './shop-account.js';
import {uuid} from './shop-drafts.js';
import {assertEmptyShopRequest,readShopRequestBody} from './shop-request-body.js';
import {downloadSeller} from './shop-download-policy.js';
import {migrateShopDownloadFulfilment} from './shop-download-fulfilment.js';
import {migrateShopPaymentStatus} from './shop-payment-status.js';
import {readShopDownloadInvoiceConsent,recordShopDownloadInvoiceConsent} from './shop-download-consent.js';
import {readShopDownloadConsentReceipt,readShopDownloadPurchaseStatus} from './shop-download-account.js';
import {readShopDownloadInvoicePreview} from './shop-download-invoice.js';
import {shopDownloadInvoicePreviewResponse} from './shop-download-invoice-view.js';

const codes={SHOP_BODY_TIMEOUT:408,PREVIEW_ARCHIVE_DISABLED:503,PREVIEW_ARCHIVE_MISMATCH:409,PREVIEW_FILE_NOT_FOUND:404,INVOICE_PREVIEW_CHANGED:409,INVOICE_QR_UNAVAILABLE:503,PDF_UNAVAILABLE:503,PDF_FONT_UNAVAILABLE:503,PDF_TOO_LARGE:503,PDF_TEXT_UNSUPPORTED:409,UNAUTHORIZED:401,FORBIDDEN:403,INVALID_REQUEST:400,INVALID_BODY:400,BODY_TOO_LARGE:413,CHECKOUT_NOT_FOUND:404,METHOD_NOT_ALLOWED:405,INVOICE_NOT_READY:409,INVOICE_CONSENT_REQUIRED:409,INVOICE_CONSENT_CHANGED:409,REQUEST_CONFLICT:409,CHECKOUT_PENDING:409,DRAFT_INELIGIBLE:409,PROFILE_CHANGED:409,PRICE_CHANGED:409,FULFILMENT_UNSUPPORTED:409,BUYER_PROFILE_UNSUPPORTED:409,INVOICE_FORMAT_NOT_READY:409,FULFILMENT_MISMATCH:409};
const prefix='/api/v1/shop/downloads/';
const json=(res,status,value,extra={})=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Frame-Options':'DENY','X-Robots-Tag':'noindex, nofollow',...extra});res.end(JSON.stringify({...value,canPay:false,canActivate:false,checkoutConnected:false}));};
function origin(value){try{const u=new URL(value);if(typeof value!=='string'||u.protocol!=='https:'||u.origin!==value||u.username||u.password||u.port)throw Error();return u.origin;}catch{throw shopError('INVALID_PUBLIC_ORIGIN');}}
async function boundedBody(req,maxBytes,timeoutMs){
 if(req.headers['content-encoding']&&!/^identity$/i.test(req.headers['content-encoding']))throw shopError('INVALID_REQUEST');
 const length=req.headers['content-length'];
 if(length!==undefined&&(typeof length!=='string'||!/^\d+$/.test(length)||!Number.isSafeInteger(Number(length))))throw shopError('INVALID_REQUEST');
 if(length!==undefined&&Number(length)>maxBytes)throw shopError('BODY_TOO_LARGE');
 return readShopRequestBody(req,{maxBytes,timeoutMs});
}
async function acceptanceBody(req,timeoutMs){
 if(!/^application\/json(?:\s*;\s*charset=utf-8)?\s*$/i.test(req.headers['content-type']||''))throw shopError('INVALID_REQUEST');
 const value=await boundedBody(req,2048,timeoutMs);
 if(Object.keys(value).length!==2||!Object.hasOwn(value,'accepted')||!Object.hasOwn(value,'acceptedDigest')||value.accepted!==true||typeof value.acceptedDigest!=='string'||!/^[a-f0-9]{64}$/.test(value.acceptedDigest))throw shopError('INVALID_REQUEST');return value;
}
// Candidate router, explicitly constructed/migrated by an integration harness.
// It is NOT imported by server/start.js. No provider, fulfilment or mail methods
// are exposed. The only write is an authenticated explicit consent receipt.
export function createShopDownloadRuntime(pool,{enabled=false,seller,publicOrigin,archiveEnabled=false,pdfRenderer=renderShopDownloadInvoicePreviewPdf,bodyTimeoutMs=15000}={}){
 if(!Number.isSafeInteger(bodyTimeoutMs)||bodyTimeoutMs<1||bodyTimeoutMs>60000)throw TypeError('INVALID_SHOP_BODY_TIMEOUT');
 const issuer=enabled===true?downloadSeller(seller):null,approvedOrigin=enabled===true?origin(publicOrigin):null;let ready=false,migration;
 return {
  async migrate(){if(enabled!==true)return;return migration??=(async()=>{try{await migrateShopPaymentStatus(pool);await migrateShopDownloadFulfilment(pool);await migrateShopDownloadHistory(pool);if(archiveEnabled===true)await migrateShopInvoicePreviewArchive(pool);ready=true;}catch(e){migration=undefined;throw e;}})();},
  async handle(req,res){
   if(enabled!==true)return false;
   // Prefix test precedes URL parsing so unrelated legacy routes stay untouched.
   if(typeof req.url!=='string'||!req.url.startsWith(prefix))return false;
   if(!ready){json(res,503,{code:'SHOP_NOT_READY'});return true;}
   try{
    const u=new URL(req.url,'http://local'),history=u.pathname===prefix+'history',match=/^\/api\/v1\/shop\/downloads\/([^/]+)\/(consent|consent-receipt|status|invoice-preview|invoice-preview\.html|invoice-preview\.pdf|archive-invoice-preview|invoice-preview-archive\.pdf)$/.exec(u.pathname);
    if(history){if(u.hash||[...u.searchParams.keys()].some(k=>!['status','cursor'].includes(k))||['status','cursor'].some(k=>u.searchParams.getAll(k).length>1))throw shopError('INVALID_REQUEST');}
    else if(!match||!uuid(match[1])||u.search||u.hash)throw shopError('INVALID_REQUEST');const id=history?null:match[1],action=history?'history':match[2],method=req.method;
    if(['archive-invoice-preview','invoice-preview-archive.pdf'].includes(action)&&archiveEnabled!==true)throw shopError('PREVIEW_ARCHIVE_DISABLED');
    const allowed=action==='archive-invoice-preview'?['POST']:action==='consent'?['GET','POST']:['GET'];if(!allowed.includes(method)){json(res,405,{code:'METHOD_NOT_ALLOWED'},{Allow:allowed.join(', ')});return true;}
    const auth=/^Bearer ([^\s]{1,512})$/i.exec(req.headers.authorization||'');if(!auth)throw shopError('UNAUTHORIZED');
    if(req.headers['sec-fetch-site']==='cross-site'||(req.headers.origin&&req.headers.origin!==approvedOrigin)||(method==='POST'&&req.headers.origin!==approvedOrigin))throw shopError('FORBIDDEN');
    if(method==='GET')assertEmptyShopRequest(req);
    const request={token:auth[1],id};let result;
    if(action==='archive-invoice-preview'){
     if(!/^application\/json(?:\s*;\s*charset=utf-8)?\s*$/i.test(req.headers['content-type']||''))throw shopError('INVALID_REQUEST');const body=await boundedBody(req,1024,bodyTimeoutMs);if(Object.keys(body).length)throw shopError('INVALID_REQUEST');
     const file=await archiveShopInvoicePreviewFile(pool,{...request,enabled:true,render:pdfRenderer,publicOrigin:approvedOrigin});result=Object.fromEntries(['kind','label','id','digest','pdfSha256','createdAt','replay','invoiceDelivered','canPay','canActivate','checkoutConnected'].map(k=>[k,file[k]]));
    }else if(action==='invoice-preview-archive.pdf'){const file=await readShopInvoicePreviewFile(pool,request);res.writeHead(file.status,file.headers);res.end(file.body);return true;}
    else if(history)result=await readShopDownloadHistory(pool,{token:auth[1],status:u.searchParams.get('status')??'all',cursor:u.searchParams.get('cursor')});
    else if(action==='consent'&&method==='GET')result=await readShopDownloadInvoiceConsent(pool,{...request,seller:issuer});
    else if(action==='consent')result=await recordShopDownloadInvoiceConsent(pool,{...request,seller:issuer,...await acceptanceBody(req,bodyTimeoutMs)});
    else if(action==='consent-receipt')result=await readShopDownloadConsentReceipt(pool,request);
    else if(action==='status')result={...await readShopDownloadPurchaseStatus(pool,request),previewArchiveAvailable:archiveEnabled===true};
    else {
     result={id,...await readShopDownloadInvoicePreview(pool,request)};
     if(action==='invoice-preview.pdf'){const response=shopDownloadInvoicePdfResponse(result.snapshot,await pdfRenderer(result.snapshot,{publicOrigin:approvedOrigin}));res.writeHead(response.status,response.headers);res.end(response.body);return true;}
     if(action==='invoice-preview.html'){const response=shopDownloadInvoicePreviewResponse(result.snapshot);res.writeHead(response.status,response.headers);res.end(response.body);return true;}
    }
    json(res,200,result);
   }catch(e){if((req.method==='POST'||req.method==='GET')&&!req.readableEnded){res.setHeader?.('Connection','close');res.once?.('finish',()=>req.destroy?.());}const code=e.code||e.message;json(res,codes[code]||503,{code:codes[code]?code:'SHOP_UNAVAILABLE',error:'Anfrage nicht abgeschlossen. Bitte den gespeicherten Kaufstatus prüfen.'});}
   return true;
  }
 };
}
