import {assertEmptyShopRequest,readShopRequestBody} from './shop-request-body.js';
import {readShopLicenceOverview} from './shop-licences.js';
import {migrateShopOrderHistory,readShopOrderHistory} from './shop-order-history.js';
import {migrateShopDraftHistory,readShopDraftHistory} from './shop-draft-history.js';
import {migrateShopCheckouts,prepareShopCheckout,readShopCheckout,abandonShopCheckout} from './shop-checkout-orders.js';
import {readShopPreview} from './shop-account.js';
import {migrateShopDrafts,saveShopDraft,readShopDraft,cancelShopDraft,uuid} from './shop-drafts.js';
const statuses={SHOP_BODY_TIMEOUT:408,BODY_TOO_LARGE:413,UNAUTHORIZED:401,FORBIDDEN:403,INVALID_REQUEST:400,INVALID_CART:400,DRAFT_NOT_FOUND:404,ACCOUNT_CHANGED:409,REQUEST_CONFLICT:409,DRAFT_PENDING:409,DRAFT_INELIGIBLE:409,CHECKOUT_PENDING:409,PRICE_CHANGED:409,CHECKOUT_NOT_FOUND:404};
const send=(res,status,body)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify({...body,canPay:false,canActivate:false,checkoutConnected:false}));};
async function body(req,keys,timeoutMs){
 if(!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(req.headers['content-type']||''))throw Error('INVALID_REQUEST');
 if(req.headers['content-encoding']&&!/^identity$/i.test(req.headers['content-encoding']))throw Error('INVALID_REQUEST');
 const length=req.headers['content-length'];
 if(length!==undefined&&(typeof length!=='string'||!/^\d+$/.test(length)||!Number.isSafeInteger(Number(length))))throw Error('INVALID_REQUEST');
 if(length!==undefined&&Number(length)>4096)throw Object.assign(Error('BODY_TOO_LARGE'),{code:'BODY_TOO_LARGE'});
 let value;try{value=await readShopRequestBody(req,{maxBytes:4096,timeoutMs});}catch(e){if(e.code==='INVALID_BODY')throw Error('INVALID_REQUEST');throw e;}
 if(Object.keys(value).some(k=>!keys.includes(k))||keys.some(k=>!Object.hasOwn(value,k)))throw Error('INVALID_REQUEST');return value;
}
export function createShopRuntime(pool,{enabled=false,bodyTimeoutMs=15000}={}){
 if(!Number.isSafeInteger(bodyTimeoutMs)||bodyTimeoutMs<1||bodyTimeoutMs>60000)throw TypeError('INVALID_SHOP_BODY_TIMEOUT');
 let ready=false,migration;
 return {
  async migrate(){if(enabled!==true)return;return migration??=(async()=>{try{await migrateShopDrafts(pool);await migrateShopCheckouts(pool);await migrateShopDraftHistory(pool);await migrateShopOrderHistory(pool);ready=true;}catch(e){migration=undefined;throw e;}})();},
  async handle(req,res){
   if(enabled!==true)return false;
   let url;try{url=new URL(req.url,'http://localhost');}catch{return false;}const path=url.pathname;
   if(enabled!==true||!(path==='/api/v1/shop/licenses'||path==='/api/v1/shop/preview'||path==='/api/v1/shop/drafts'||path.startsWith('/api/v1/shop/drafts/')||path==='/api/v1/shop/checkouts'||path.startsWith('/api/v1/shop/checkouts/')))return false;
   if(!ready){send(res,503,{code:'SHOP_NOT_READY',error:'Shop noch nicht bereit.'});return true;}
   try{
    if(url.hash)throw Error('INVALID_REQUEST');
    if(req.method==='GET')assertEmptyShopRequest(req);
    if(req.headers['sec-fetch-site']==='cross-site')throw Error('FORBIDDEN');
    const licences=path==='/api/v1/shop/licenses';if(licences){if(req.method!=='GET'){res.setHeader('Allow','GET');send(res,405,{code:'METHOD_NOT_ALLOWED'});return true;}if(req.headers['sec-fetch-site']==='cross-site')throw Error('FORBIDDEN');if(req.headers['transfer-encoding']||(req.headers['content-length']&&req.headers['content-length']!=='0'))throw Error('INVALID_REQUEST');if(url.hash)throw Error('INVALID_REQUEST');}
    const orderHistory=path==='/api/v1/shop/checkouts/history';
    if(orderHistory){if(req.method!=='GET'){res.setHeader('Allow','GET');send(res,405,{code:'METHOD_NOT_ALLOWED'});return true;}if(req.headers['sec-fetch-site']==='cross-site')throw Error('FORBIDDEN');if(req.headers['transfer-encoding']||(req.headers['content-length']&&req.headers['content-length']!=='0'))throw Error('INVALID_REQUEST');if(url.hash||[...url.searchParams.keys()].some(k=>!['cursor','status','product','reference'].includes(k))||['cursor','status','product','reference'].some(k=>url.searchParams.getAll(k).length>1))throw Error('INVALID_REQUEST');}
    const history=path==='/api/v1/shop/drafts/history';if(history){if([...url.searchParams.keys()].some(k=>k!=='cursor')||url.searchParams.getAll('cursor').length>1)throw Error('INVALID_REQUEST');}else if(!orderHistory&&url.search)throw Error('INVALID_REQUEST');const match=/^Bearer ([^\s]{1,512})$/i.exec(req.headers.authorization||'');if(!match)throw Error('UNAUTHORIZED');const token=match[1];let result;
    if(licences)result=await readShopLicenceOverview(pool,{token});
    else if(orderHistory)result=await readShopOrderHistory(pool,{token,cursor:url.searchParams.get('cursor'),status:url.searchParams.get('status')??'all',product:url.searchParams.get('product')??'all',reference:url.searchParams.get('reference')});
    else if(history&&req.method==='GET')result=await readShopDraftHistory(pool,{token,cursor:url.searchParams.get('cursor')});
    else if(path==='/api/v1/shop/checkouts'&&req.method==='POST')result=await prepareShopCheckout(pool,{token,...await body(req,['draftId','requestId','acceptedNetCents','acceptedGrossCents'],bodyTimeoutMs)});
    else if(/^\/api\/v1\/shop\/checkouts\/drafts\/[^/]+$/.test(path)&&req.method==='GET')result=await readShopCheckout(pool,{token,draftId:path.split('/').at(-1)});
    else if(/^\/api\/v1\/shop\/checkouts\/[^/]+\/cancel$/.test(path)&&req.method==='POST'){await body(req,[],bodyTimeoutMs);result=await abandonShopCheckout(pool,{token,id:path.split('/').at(-2)});}
    else if(/^\/api\/v1\/shop\/checkouts\/[^/]+$/.test(path)&&req.method==='GET')result=await readShopCheckout(pool,{token,id:path.split('/').at(-1)});
    else if(path==='/api/v1/shop/preview'&&req.method==='POST')result=await readShopPreview(pool,{token,...await body(req,['cart'],bodyTimeoutMs)});
    else if(path==='/api/v1/shop/drafts'&&req.method==='POST')result=await saveShopDraft(pool,{token,...await body(req,['requestId','cart'],bodyTimeoutMs)});
    else if(path==='/api/v1/shop/drafts/active'&&req.method==='GET')result=await readShopDraft(pool,{token,active:true});
    else if(/^\/api\/v1\/shop\/drafts\/requests\/[^/]+$/.test(path)&&req.method==='GET'){const requestId=path.split('/').at(-1);if(!uuid(requestId))throw Error('INVALID_REQUEST');result=await readShopDraft(pool,{token,requestId});}
    else if(/^\/api\/v1\/shop\/drafts\/[^/]+\/cancel$/.test(path)&&req.method==='POST'){await body(req,[],bodyTimeoutMs);result=await cancelShopDraft(pool,{token,id:path.split('/').at(-2)});}
    else if(/^\/api\/v1\/shop\/drafts\/[^/]+$/.test(path)&&req.method==='GET')result=await readShopDraft(pool,{token,id:path.split('/').at(-1)});
    else {send(res,405,{code:'METHOD_NOT_ALLOWED'});return true;}
    send(res,200,result);
   }catch(e){if((req.method==='POST'||req.method==='GET')&&!req.readableEnded){res.setHeader?.('Connection','close');res.once?.('finish',()=>req.destroy?.());}const code=e.code||e.message;send(res,statuses[code]||503,{code:statuses[code]?code:'SHOP_UNAVAILABLE',error:'Anfrage nicht abgeschlossen. Bitte Konto und gespeicherten Entwurf prüfen.'});}
   return true;
  }
 };
}
