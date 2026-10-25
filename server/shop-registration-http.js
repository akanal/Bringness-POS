import crypto from 'node:crypto';
import {readRegistrationBody} from './shop-registration-body.js';
import {migrateShopRegistration,registerShopAccount} from './shop-registration.js';
import {createShopRegistrationLimiter} from './shop-registration-limiter.js';
const path='/api/v1/shop/registrations';
const statuses={INVALID_REGISTRATION:400,INVALID_BODY:400,REGISTRATION_BODY_TIMEOUT:408,BODY_TOO_LARGE:413,EMAIL_UNAVAILABLE:409,REQUEST_CONFLICT:409,REGISTRATION_REVIEW:409};
function send(res,status,value){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(value));}
// Separate opt-in candidate. Not imported or mounted at production startup.
export function createShopRegistrationRuntime(pool,{enabled=false,publicOrigin,limiter=createShopRegistrationLimiter(),maxConcurrent=2,bodyTimeoutMs=15000}={}){
 let origin,ready=false,migration,active=0;
 if(!Number.isSafeInteger(bodyTimeoutMs)||bodyTimeoutMs<1||bodyTimeoutMs>60000)throw TypeError('INVALID_REGISTRATION_BODY_TIMEOUT');
 if(!Number.isSafeInteger(maxConcurrent)||maxConcurrent<1||maxConcurrent>8)throw TypeError('INVALID_REGISTRATION_CAPACITY');
 if(enabled===true){try{const u=new URL(publicOrigin);if(u.protocol!=='https:'||u.username||u.password||u.port||u.pathname!=='/'||u.search||u.hash)throw Error();origin=u.origin;}catch{throw Error('INVALID_REGISTRATION_ORIGIN');}}
 return {
  async migrate(){if(enabled!==true)return;return migration??=(async()=>{try{await migrateShopRegistration(pool);ready=true;}catch(e){migration=undefined;throw e;}})();},
  async handle(req,res){
   if(enabled!==true)return false;let url;try{url=new URL(req.url,'http://localhost');}catch{return false;}if(url.pathname!==path)return false;
   if(req.method!=='POST'){res.setHeader('Allow','POST');send(res,405,{code:'METHOD_NOT_ALLOWED'});return true;}
   if(url.search||url.hash||req.headers.origin!==origin||req.headers['sec-fetch-site']==='cross-site'){send(res,403,{code:'FORBIDDEN'});return true;}
   if(!ready){send(res,503,{code:'REGISTRATION_NOT_READY'});return true;}
   if(!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(req.headers['content-type']||'')){send(res,400,{code:'INVALID_REGISTRATION'});return true;}
   if(req.headers['content-encoding']&&!/^identity$/i.test(req.headers['content-encoding'])){send(res,415,{code:'INVALID_REGISTRATION'});return true;}
   const length=req.headers['content-length'];
   if(length!==undefined&&(typeof length!=='string'||!/^\d+$/.test(length)||!Number.isSafeInteger(Number(length)))){send(res,400,{code:'INVALID_REGISTRATION'});return true;}
   if(length!==undefined&&Number(length)>16384){send(res,413,{code:'BODY_TOO_LARGE'});return true;}
   if(active>=maxConcurrent){send(res,503,{code:'REGISTRATION_BUSY'});return true;}
   const remote=typeof req.socket?.remoteAddress==='string'?req.socket.remoteAddress.slice(0,256):'unknown',key=crypto.createHash('sha256').update(remote).digest('hex'),admission=limiter.admit(key);
   if(!admission.allowed){res.setHeader('Retry-After',String(admission.retryAfter));send(res,429,{code:'REGISTRATION_LIMIT'});return true;}
   active++;
   try{
    const body=await readRegistrationBody(req,{maxBytes:16384,timeoutMs:bodyTimeoutMs});if(Object.keys(body).length!==2||!Object.hasOwn(body,'requestId')||!Object.hasOwn(body,'registration'))throw Object.assign(Error(),{code:'INVALID_REGISTRATION'});
    const receipt=await registerShopAccount(pool,{enabled:true,requestId:body.requestId,registration:body.registration});
    send(res,200,{version:receipt.version,requestId:receipt.requestId,recorded:receipt.recorded,replay:receipt.replay,loginRequired:receipt.loginRequired,canPay:false,canActivate:false,checkoutConnected:false});
   }catch(e){if(!req.readableEnded){res.setHeader('Connection','close');res.once?.('finish',()=>req.destroy?.());}const status=statuses[e.code]||503;send(res,status,{code:statuses[e.code]?e.code:'REGISTRATION_UNAVAILABLE'});}finally{active--;}
   return true;
  }
 };
}
