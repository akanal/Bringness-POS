import {createShopMollieTestAdapter} from './shop-mollie-test-adapter.js';
import {readShopPaymentSession,startShopPaymentSession,refreshShopPaymentSession} from './shop-payment-session.js';
import {assertEmptyShopRequest,readShopRequestBody} from './shop-request-body.js';
import {migrateShopPaymentStatus} from './shop-payment-status.js';
import {shopError} from './shop-account.js';

const statuses={UNAUTHORIZED:401,FORBIDDEN:403,INVALID_REQUEST:400,INVALID_BODY:400,BODY_TOO_LARGE:413,SHOP_BODY_TIMEOUT:408,CHECKOUT_NOT_FOUND:404,CHECKOUT_PENDING:409,PAYMENT_SESSION_CHANGED:409,PAYMENT_MODE_MISMATCH:409,INVOICE_CONSENT_REQUIRED:409,PRICE_CHANGED:409,PROFILE_CHANGED:409,DRAFT_INELIGIBLE:409,ACCOUNT_CHANGED:409,PROVIDER_UNCERTAIN:503,PROVIDER_MISMATCH:409};
const send=(res,status,value)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(value));};
// Explicit opt-in only. Construct after the ordinary shop migrations; this
// router cannot select LIVE keys or issue licences, invoices, or subscriptions.
export function createShopPaymentRuntime(pool,{enabled=false,apiKey,publicOrigin,bodyTimeoutMs=15000}={}){
 let adapter,origin,ready=false,migration;
 if(enabled===true){
  adapter=createShopMollieTestAdapter({apiKey,publicOrigin,webhookEnabled:false});
  origin=new URL(publicOrigin).origin;
 }
 if(!Number.isSafeInteger(bodyTimeoutMs)||bodyTimeoutMs<1||bodyTimeoutMs>60000)throw TypeError('INVALID_SHOP_BODY_TIMEOUT');
 return {
  async migrate(){if(enabled!==true)return;return migration??=(async()=>{try{await migrateShopPaymentStatus(pool);ready=true;}catch(e){migration=undefined;throw e;}})();},
  async handle(req,res){
   if(enabled!==true)return false;
   let url;try{url=new URL(req.url,'http://local');}catch{return false;}
   const match=/^\/api\/v1\/shop\/payment-sessions\/([0-9a-f-]+)(?:\/(start|refresh))?$/.exec(url.pathname);
   if(!match)return false;
   if(!ready){send(res,503,{code:'SHOP_NOT_READY'});return true;}
   try{
    if(url.search||url.hash)throw shopError('INVALID_REQUEST');
    const action=match[2],method=action?'POST':'GET';
    if(req.method!==method){res.setHeader('Allow',method);send(res,405,{code:'METHOD_NOT_ALLOWED'});return true;}
    if(req.headers['sec-fetch-site']==='cross-site'||(req.headers.origin&&req.headers.origin!==origin)||(method==='POST'&&req.headers.origin!==origin))throw shopError('FORBIDDEN');
    const auth=/^Bearer ([^\s]{1,512})$/i.exec(req.headers.authorization||'');if(!auth)throw shopError('UNAUTHORIZED');
    if(method==='GET')assertEmptyShopRequest(req);
    else{
     if(!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(req.headers['content-type']||'')||(req.headers['content-encoding']&&req.headers['content-encoding']!=='identity'))throw shopError('INVALID_REQUEST');
     const value=await readShopRequestBody(req,{maxBytes:128,timeoutMs:bodyTimeoutMs});
     if(Object.keys(value).length)throw shopError('INVALID_REQUEST');
    }
    const request={token:auth[1],id:match[1]};
    const value=action==='start'?await startShopPaymentSession(pool,request,adapter):action==='refresh'?await refreshShopPaymentSession(pool,request,adapter):await readShopPaymentSession(pool,request);
    send(res,200,value);
   }catch(e){
    if(!req.readableEnded){res.setHeader('Connection','close');res.once?.('finish',()=>req.destroy?.());}
    const code=e.code||e.message;send(res,statuses[code]||503,{code:statuses[code]?code:'SHOP_UNAVAILABLE'});
   }
   return true;
  }
 };
}
