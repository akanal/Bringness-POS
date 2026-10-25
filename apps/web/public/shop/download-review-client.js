// Browser controller for the independent shop review candidate; backend remains opt-in.
// No local/session storage, provider calls, payment creation or automatic POST.
const error=code=>Object.assign(Error(code),{code,shopClientError:true});
const validId=id=>typeof id==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
const digest=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
export function createDownloadReviewClient({fetcher=globalThis.fetch,getToken,timeoutMs=15000}={}){
 if(typeof fetcher!=='function'||typeof getToken!=='function'||!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>60000)throw error('INVALID_REQUEST');
 let active=null,generation=0,review=null,reviewAccount=null,uncertain=null,preview=null,previewAccount=null,archiveAccount=null,archiveId=null;
 function invalidate(){generation++;active?.abort();active=null;review=null;reviewAccount=null;uncertain=null;preview=null;previewAccount=null;archiveAccount=null;archiveId=null;}
 async function request(id,action,{body}={}){
  if(!validId(id))throw error('INVALID_REQUEST');if(active)throw error('REQUEST_BUSY');
  const token=getToken();if(typeof token!=='string'||!token||token.length>512||/\s/.test(token))throw error('UNAUTHORIZED');
  const epoch=generation,controller=new AbortController();active=controller;const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
   const response=await fetcher(`/api/v1/shop/downloads/${id}/${action}`,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${token}`,...(body?{'Content-Type':'application/json; charset=utf-8'}:{})},...(body?{body:JSON.stringify(body)}:{}),credentials:'omit',mode:'same-origin',cache:'no-store',redirect:'error',signal:controller.signal});
   const value=await response.json();if(epoch!==generation||getToken()!==token)throw error('ACCOUNT_CHANGED');
   if(!response.ok){const code=typeof value?.code==='string'&&/^[A-Z_]{1,50}$/.test(value.code)?value.code:'SHOP_UNAVAILABLE';throw Object.assign(error(code),{status:response.status});}
   if(!value||value.id!==id||value.canPay!==false||value.canActivate!==false||value.checkoutConnected!==false)throw error('INVALID_RESPONSE');
   return value;
  }catch(e){if(epoch!==generation||getToken()!==token)throw error('ACCOUNT_CHANGED');if(e.shopClientError===true)throw e;throw error('REQUEST_UNCERTAIN');}
  finally{clearTimeout(timer);if(active===controller)active=null;}
 }
 async function pdf(id,expectedDigest,archived=false){
  if(archived&&(archiveAccount!==getToken()||archiveId!==id))throw error('PREVIEW_ARCHIVE_DISABLED');
  if(!validId(id)||!digest(expectedDigest))throw error('INVALID_REQUEST');
  if(previewAccount!==null&&getToken()!==previewAccount){invalidate();throw error('ACCOUNT_CHANGED');}
  if(!preview||preview.id!==id||preview.digest!==expectedDigest)throw error('INVOICE_PREVIEW_REQUIRED');if(active)throw error('REQUEST_BUSY');
  const token=getToken(),epoch=generation,controller=new AbortController();active=controller;const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
   const response=await fetcher(`/api/v1/shop/downloads/${id}/${archived?'invoice-preview-archive.pdf':'invoice-preview.pdf'}`,{method:'GET',headers:{Authorization:`Bearer ${token}`},credentials:'omit',mode:'same-origin',cache:'no-store',redirect:'error',signal:controller.signal});
   if(!response.ok){let value;try{value=await response.json();}catch{}throw Object.assign(error(typeof value?.code==='string'&&/^[A-Z_]{1,50}$/.test(value.code)?value.code:'PDF_UNAVAILABLE'),{status:response.status});}
   const headers=response.headers,length=headers.get('content-length'),sha=headers.get('x-shop-pdf-sha256'),source=headers.get('x-shop-invoice-source-digest'),name=/^attachment; filename="(Bringness-Vorschau-BN-\d{4}-\d{6,20}\.pdf)"$/.exec(headers.get('content-disposition')||'');
   if(source!==expectedDigest)throw error('INVOICE_PREVIEW_CHANGED');
   if(headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/pdf'||!/^\d{1,7}$/.test(length||'')||Number(length)<100||Number(length)>2097152||!digest(sha)||!name||name[1]!=='Bringness-Vorschau-'+preview.snapshot.invoiceNumber+'.pdf'||!response.body?.getReader)throw error('INVALID_RESPONSE');
   const reader=response.body.getReader(),chunks=[];let size=0;
   try{while(true){if(epoch!==generation||getToken()!==token){await reader.cancel();throw error('ACCOUNT_CHANGED');}const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>Number(length)){await reader.cancel();throw error('INVALID_RESPONSE');}chunks.push(part.value);}}finally{reader.releaseLock();}
   if(size!==Number(length))throw error('INVALID_RESPONSE');const bytes=new Uint8Array(size);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.length;}
   if(new TextDecoder().decode(bytes.subarray(0,8))!=='%PDF-1.7'||!globalThis.crypto?.subtle)throw error('INVALID_RESPONSE');
   const computed=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');if(computed!==sha)throw error('INVALID_RESPONSE');
   if(epoch!==generation||getToken()!==token)throw error('ACCOUNT_CHANGED');return Object.freeze({bytes,filename:name[1],sourceDigest:source,sha256:sha});
  }catch(e){if(epoch!==generation||getToken()!==token)throw error('ACCOUNT_CHANGED');if(e.shopClientError===true)throw e;throw error('PDF_UNAVAILABLE');}
  finally{clearTimeout(timer);if(active===controller)active=null;}
 }
 return {
  invalidate,
  async readConsent(id){
   if(active)throw error('REQUEST_BUSY');review=null;reviewAccount=null;const account=getToken(),value=await request(id,'consent');
   if(value.accepted!==false||!digest(value.digest)||!Number.isFinite(Date.parse(value.expiresAt))||Date.parse(value.expiresAt)<=Date.now())throw error('CONSENT_NOT_READY');
   review=freeze(value);reviewAccount=account;return review;
  },
  async acceptConsent(view,{accepted=false}={}){
   if(accepted!==true)throw error('INVOICE_CONSENT_REQUIRED');if(reviewAccount!==null&&getToken()!==reviewAccount){invalidate();throw error('ACCOUNT_CHANGED');}if(uncertain)throw error('CONSENT_REVIEW_REQUIRED');
   if(!review||view!==review||Date.parse(view.expiresAt)<=Date.now())throw error('CONSENT_NOT_READY');
   try{
    const result=await request(view.id,'consent',{body:{accepted:true,acceptedDigest:view.digest}});
    if(result.recorded!==true)throw error('INVALID_RESPONSE');review=null;return freeze(result);
   }catch(e){
    if(e.code==='ACCOUNT_CHANGED'){review=null;uncertain=null;}
    else if(e.code!=='REQUEST_BUSY'&&(!e.status||e.status>=500)){uncertain={id:view.id,digest:view.digest,account:reviewAccount};}
    throw e;
   }
  },
  async readReceipt(id){
   if(uncertain&&getToken()!==uncertain.account){invalidate();throw error('ACCOUNT_CHANGED');}const value=await request(id,'consent-receipt');if(typeof value.recorded!=='boolean'||(value.recorded&&!digest(value.digest)))throw error('INVALID_RESPONSE');
   if(uncertain?.id===id){if(value.recorded&&value.digest!==uncertain.digest)throw error('CONSENT_CONFLICT');uncertain=null;if(value.recorded)review=null;}
   return freeze(value);
  },
  async readStatus(id){
   if(active)throw error('REQUEST_BUSY');archiveAccount=null;archiveId=null;
   const value=await request(id,'status');if(!['prepared','uncertain','open','paid','failed','canceled'].includes(value.status)||value.licence!=='blocked'||value.purchaseCompleted!==false||value.invoiceDelivered!==false||typeof value.invoicePreviewAvailable!=='boolean'||(value.previewArchiveAvailable!==undefined&&typeof value.previewArchiveAvailable!=='boolean'))throw error('INVALID_RESPONSE');archiveAccount=value.previewArchiveAvailable===true?getToken():null;archiveId=value.previewArchiveAvailable===true?id:null;return freeze(value);
  },
  async archiveInvoicePreview(id,{expectedDigest}={}){
   if(archiveAccount!==getToken()||archiveId!==id)throw error('PREVIEW_ARCHIVE_DISABLED');if(previewAccount!==null&&previewAccount!==getToken()){invalidate();throw error('ACCOUNT_CHANGED');}if(!preview||preview.id!==id||preview.digest!==expectedDigest||!digest(expectedDigest))throw error('INVOICE_PREVIEW_REQUIRED');
   const receipt=await request(id,'archive-invoice-preview',{body:{}});if(receipt.kind!=='invoice_preview'||receipt.digest!==expectedDigest||!digest(receipt.pdfSha256)||!Number.isFinite(Date.parse(receipt.createdAt))||typeof receipt.replay!=='boolean'||receipt.invoiceDelivered!==false)throw error('INVALID_RESPONSE');return freeze(receipt);
  },
  readArchivedInvoicePreviewPdf(id,{expectedDigest}={}){return pdf(id,expectedDigest,true);},
  readInvoicePreviewPdf(id,{expectedDigest}={}){return pdf(id,expectedDigest);},
  async readInvoicePreview(id){if(active)throw error('REQUEST_BUSY');preview=null;previewAccount=null;const account=getToken(),value=await request(id,'invoice-preview');if(value.kind!=='invoice_preview'||value.snapshot?.checkoutId!==id||!digest(value.digest)||value.invoiceDelivered!==false)throw error('INVALID_RESPONSE');preview=freeze(value);previewAccount=account;return preview;}
 };
}
