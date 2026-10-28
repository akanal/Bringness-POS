import {shopError} from './shop-account.js';
import {documentMaxBytes} from './idrive-document-store.js';
import {authorizeDocuments,migrateShopDocuments,listShopDocuments,uploadShopDocument,downloadShopDocument,documentLimits} from './shop-documents.js';
import {assertEmptyShopRequest} from './shop-request-body.js';
const prefix='/api/v1/shop/documents';
const codes={UNAUTHORIZED:401,FORBIDDEN:403,INVALID_DOCUMENT:400,INVALID_REQUEST:400,DOCUMENT_CONFLICT:409,DOCUMENT_QUOTA:409,DOCUMENT_NOT_FOUND:404,DOCUMENT_STORAGE_UNAVAILABLE:503,BODY_TOO_LARGE:413,SHOP_BODY_TIMEOUT:408,DOCUMENT_BUSY:429};
const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Frame-Options':'DENY','X-Robots-Tag':'noindex, nofollow'};
function json(res,status,value){res.writeHead(status,{...headers,'Content-Type':'application/json; charset=utf-8',...(status>=400?{Connection:'close'}:{})});res.end(JSON.stringify(value));}
export function documentRequestBytes(req,timeoutMs=15000){return new Promise((resolve,reject)=>{
 let length=0,done=false;const chunks=[];
 const finish=(error)=>{if(done)return;done=true;clearTimeout(timer);for(const [event,fn]of events)req.removeListener(event,fn);if(error){chunks.length=0;req.pause?.();reject(shopError(error));}else resolve(Buffer.concat(chunks,length));};
 const events=[['data',chunk=>{if(!Buffer.isBuffer(chunk))return finish('INVALID_DOCUMENT');length+=chunk.length;if(length>documentMaxBytes)return finish('BODY_TOO_LARGE');chunks.push(chunk);}],['end',()=>finish()],['aborted',()=>finish('INVALID_DOCUMENT')],['error',()=>finish('INVALID_DOCUMENT')],['close',()=>{if(!req.readableEnded)finish('INVALID_DOCUMENT');}]];
 const timer=setTimeout(()=>finish('SHOP_BODY_TIMEOUT'),timeoutMs);for(const [event,fn]of events)req.on(event,fn);if(req.destroyed||req.aborted||req.readableEnded)finish('INVALID_DOCUMENT');
 });}
export function createShopDocumentsRuntime(pool,{enabled=false,store=null,publicOrigin='https://bringness.de',bodyTimeoutMs=15000}={}){
 let ready=false,active=0;const readyStorage=()=>Boolean(store&&ready);
 return {
  async migrate(){if(enabled&&store){await migrateShopDocuments(pool);ready=true;}},
  async handle(req,res){
   if(!enabled||typeof req.url!=='string'||!req.url.startsWith(prefix))return false;
   try{
    const u=new URL(req.url,'http://local');if(u.search||u.hash)throw shopError('INVALID_REQUEST');
    if(u.pathname===prefix+'/status'&&req.method==='GET'){assertEmptyShopRequest(req);json(res,200,{storage:'idrive',configured:Boolean(store),available:readyStorage(),limits:documentLimits});return true;}
    const match=new RegExp('^'+prefix+'/([a-f0-9-]{36})$').exec(u.pathname);if(u.pathname!==prefix&&!match){json(res,404,{code:'DOCUMENT_NOT_FOUND'});return true;}
    if(!readyStorage())throw shopError('DOCUMENT_STORAGE_UNAVAILABLE');
    const auth=/^Bearer ([^\s]{1,512})$/i.exec(req.headers.authorization||'');if(!auth)throw shopError('UNAUTHORIZED');
    if(req.headers['sec-fetch-site']==='cross-site'||req.headers.origin&&req.headers.origin!==publicOrigin||req.method==='POST'&&req.headers.origin!==publicOrigin)throw shopError('FORBIDDEN');
    if(req.method==='GET'){
     assertEmptyShopRequest(req);
     if(match){if(active>=4)throw shopError('DOCUMENT_BUSY');active++;try{const file=await downloadShopDocument(pool,store,{token:auth[1],id:match[1]});res.writeHead(200,{...headers,'Content-Type':file.document.mime,'Content-Length':String(file.body.length),'Content-Disposition':"attachment; filename=\"Bringness-Dokument\"; filename*=UTF-8''"+encodeURIComponent(file.document.filename).replaceAll("'",'%27'),'Content-Security-Policy':"default-src 'none'; sandbox",'X-Document-Sha256':file.document.sha256});res.end(file.body);}finally{active--;}}
     else json(res,200,await listShopDocuments(pool,{token:auth[1]}));return true;
    }
    if(req.method!=='POST'||match){json(res,405,{code:'METHOD_NOT_ALLOWED'});return true;}
    if(active>=2)throw shopError('DOCUMENT_BUSY');active++;
    try{
     await authorizeDocuments(pool,auth[1]);
     const length=req.headers['content-length'];if(req.headers['content-encoding']&&req.headers['content-encoding']!=='identity'||length!==undefined&&(!/^\d+$/.test(length)||Number(length)>documentMaxBytes))throw shopError('BODY_TOO_LARGE');
     let filename;try{filename=decodeURIComponent(req.headers['x-document-name']||'');}catch{throw shopError('INVALID_DOCUMENT');}
     if(!['application/pdf','image/png','image/jpeg'].includes(req.headers['content-type'])||filename.length>160||typeof req.headers['x-document-id']!=='string')throw shopError('INVALID_DOCUMENT');
     const bytes=await documentRequestBytes(req,bodyTimeoutMs),result=await uploadShopDocument(pool,store,{token:auth[1],id:req.headers['x-document-id'],filename,mime:req.headers['content-type'],bytes});json(res,200,result);return true;
    }finally{active--;}
   }catch(error){json(res,codes[error.code]||503,{code:Object.hasOwn(codes,error.code)?error.code:'DOCUMENT_STORAGE_UNAVAILABLE'});return true;}
  }
 };
}
