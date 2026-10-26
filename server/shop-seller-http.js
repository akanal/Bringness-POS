import {assertEmptyShopRequest,readShopRequestBody} from './shop-request-body.js';
import {migrateSellerDrafts,writeSellerDraft,readSellerDraft,listSellerDrafts,sellerDraftHistory} from './shop-seller-drafts.js';
const codes={INVALID_BODY:400,UNAUTHORIZED:401,FORBIDDEN:403,INVALID_REQUEST:400,INVALID_OFFER:400,OFFER_NOT_FOUND:404,REVISION_CONFLICT:409,REQUEST_CONFLICT:409,ACCOUNT_CHANGED:409,OFFER_ARCHIVED:409,OFFER_LIMIT:409,CHANGE_LIMIT:409,BODY_TOO_LARGE:413,SHOP_BODY_TIMEOUT:408};
const send=(res,status,body)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});res.end(JSON.stringify({...body,canPublish:false}));};
export function createSellerRuntime(pool,{enabled=false,publicOrigin='https://bringness.de',bodyTimeoutMs=15000}={}){
 if(!Number.isSafeInteger(bodyTimeoutMs)||bodyTimeoutMs<1||bodyTimeoutMs>60000)throw Error('INVALID_SELLER_TIMEOUT');
 if(enabled){const u=new URL(publicOrigin);if(u.protocol!=='https:'||u.origin!==publicOrigin||u.username||u.password)throw Error('INVALID_SELLER_ORIGIN');}
 let ready=false,pending,active=0;
 return {async migrate(){if(!enabled)return;return pending??=(async()=>{try{await migrateSellerDrafts(pool);ready=true;}catch(e){pending=undefined;throw e;}})();},async handle(req,res){
  if(!enabled)return false;let url;try{url=new URL(req.url,'http://local');}catch{return false;}
  const base='/api/v1/shop/seller/offers';if(url.pathname!==base&&!url.pathname.startsWith(base+'/'))return false;
  if(!ready){send(res,503,{code:'SELLER_NOT_READY'});return true;}
  if(active>=4){send(res,503,{code:'SELLER_BUSY'});return true;}active++;
  try{
   if(req.headers['sec-fetch-site']==='cross-site')throw Error('FORBIDDEN');
   const bearer=/^Bearer ([^\s]{1,512})$/i.exec(req.headers.authorization||'');if(!bearer)throw Error('UNAUTHORIZED');const token=bearer[1];
   if(!['GET','POST'].includes(req.method)){res.setHeader('Allow','GET, POST');send(res,405,{code:'METHOD_NOT_ALLOWED'});return true;}
   let result;
   if(req.method==='POST'){
    if(req.headers.origin!==publicOrigin||url.search||url.hash)throw Error('FORBIDDEN');
    if(url.pathname!==base){send(res,405,{code:'METHOD_NOT_ALLOWED'});return true;}
    if(!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(req.headers['content-type']||'')||req.headers['content-encoding']&&!/^identity$/i.test(req.headers['content-encoding']))throw Error('INVALID_REQUEST');
    const command=await readShopRequestBody(req,{maxBytes:16384,timeoutMs:bodyTimeoutMs});result=await writeSellerDraft(pool,{token,command});
   }else{
    assertEmptyShopRequest(req);if(url.hash)throw Error('INVALID_REQUEST');
    if(url.pathname===base){if([...url.searchParams.keys()].some(k=>!['q','state','cursor','category','kind','stock'].includes(k))||['q','state','cursor','category','kind','stock'].some(k=>url.searchParams.getAll(k).length>1))throw Error('INVALID_REQUEST');result=await listSellerDrafts(pool,{token,query:url.searchParams.get('q')??'',state:url.searchParams.get('state')??'draft',category:url.searchParams.get('category')??'Alle',kind:url.searchParams.get('kind')??'all',stock:url.searchParams.get('stock')??'all',cursor:url.searchParams.get('cursor')});}
    else{
     if(url.search)throw Error('INVALID_REQUEST');const parts=url.pathname.slice(base.length+1).split('/');
     if(parts.length===1)result=await readSellerDraft(pool,{token,id:parts[0]});
     else if(parts.length===2&&parts[1]==='history')result=await sellerDraftHistory(pool,{token,id:parts[0]});
     else if(parts.length===3&&parts[1]==='revisions'&&/^[1-9]\d{0,8}$/.test(parts[2]))result=await readSellerDraft(pool,{token,id:parts[0],revision:Number(parts[2])});
     else throw Error('INVALID_REQUEST');
    }
   }send(res,200,result);
  }catch(e){if(!req.readableEnded&&['GET','POST'].includes(req.method)){res.setHeader?.('Connection','close');res.once?.('finish',()=>req.destroy?.());}const code=e.code||e.message;send(res,codes[code]||503,{code:codes[code]?code:'SELLER_UNAVAILABLE',error:'Nicht abgeschlossen. Bitte gespeicherten Stand prüfen.'});}finally{active--;}return true;
 }};
}
