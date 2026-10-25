import {readShopRequestBytes} from './shop-request-body.js';
import {paymentId} from './shop-provider-proof.js';
import {enqueueShopTestPayment} from './shop-test-payment-queue.js';
export const shopTestWebhookPath='/api/v1/shop/test-payments/webhook';
// Optional legacy Payments-API ID callback, TEST-only. Not mounted at startup.
// Body is merely a wake-up signal, never payment evidence.
export function createShopTestWebhook(pool,{enabled=false,bodyTimeoutMs=15000}={}){
 if(!Number.isSafeInteger(bodyTimeoutMs)||bodyTimeoutMs<1||bodyTimeoutMs>60000)throw TypeError('INVALID_SHOP_BODY_TIMEOUT');
 const send=(res,status)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(JSON.stringify(status===200?{ok:true}:{ok:false}));};
 return {async handle(req,res){
  if(enabled!==true)return false;
  let url;try{url=new URL(req.url,'http://local');}catch{return false;}if(url.pathname!==shopTestWebhookPath)return false;
  if(req.method!=='POST'){send(res,405);return true;}
  let id;try{
   if(url.search||url.hash||!/^application\/x-www-form-urlencoded(?:\s*;\s*charset=utf-8)?$/i.test(req.headers['content-type']||''))throw Error();
   if(req.headers['content-encoding']&&!/^identity$/i.test(req.headers['content-encoding']))throw Error();
   const length=req.headers['content-length'];
   if(length!==undefined&&(typeof length!=='string'||!/^\d+$/.test(length)||!Number.isSafeInteger(Number(length))))throw Error();
   if(length!==undefined&&Number(length)>1024)throw Object.assign(Error('BODY_TOO_LARGE'),{code:'BODY_TOO_LARGE'});
   const raw=new TextDecoder('utf-8',{fatal:true}).decode(await readShopRequestBytes(req,{maxBytes:1024,timeoutMs:bodyTimeoutMs}));const form=new URLSearchParams(raw);
   if([...form.keys()].some(k=>k!=='id')||form.getAll('id').length!==1||!paymentId(form.get('id')))throw Error();id=form.get('id');
  }catch(error){if(!req.readableEnded){res.setHeader?.('Connection','close');res.once?.('finish',()=>req.destroy?.());}send(res,error.code==='SHOP_BODY_TIMEOUT'?408:error.code==='BODY_TOO_LARGE'?413:400);return true;}
  try{await enqueueShopTestPayment(pool,id);send(res,200);}catch{send(res,503);}return true;
 }};
}
