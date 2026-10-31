import {documentRequestBytes} from './shop-documents-http.js';
import {createMarketplaceImages,migrateMarketplaceImages,imageLimits} from './shop-marketplace-images.js';
import {readShopRequestBody,assertEmptyShopRequest} from './shop-request-body.js';
import {shopActor,sessionHash} from './shop-account.js';
const prefix='/api/v1/shop/marketplace/images';
const errors={UNAUTHORIZED:401,FORBIDDEN:403,ACCOUNT_CHANGED:409,INVALID_IMAGE:400,INVALID_DOCUMENT:400,INVALID_BODY:400,INVALID_REQUEST:400,IMAGE_CONFLICT:409,REVISION_CONFLICT:409,IMAGE_NOT_FOUND:404,OFFER_NOT_FOUND:404,SELLER_NOT_APPROVED:403,IMAGE_QUOTA:409,BODY_TOO_LARGE:413,SHOP_BODY_TIMEOUT:408};
const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Cross-Origin-Resource-Policy':'same-origin'};
export function createMarketplaceImagesRuntime(pool,{enabled=false,store=null,publicOrigin='https://bringness.de'}={}){
 const api=createMarketplaceImages(pool,store);let ready=false,active=0;
 const json=(res,n,data)=>{res.writeHead(n,{...headers,'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));};
 return {async migrate(){if(enabled&&store){await migrateMarketplaceImages(pool);ready=true;}},async handle(req,res){
  let u;try{u=new URL(req.url,'http://local');}catch{return false;}if(u.pathname!==prefix&&!u.pathname.startsWith(prefix+'/'))return false;
  try{
   if(!enabled||!ready||!store){json(res,503,{code:'IMAGE_STORAGE_UNAVAILABLE'});return true;}
   if(u.search||u.hash)throw Error('INVALID_REQUEST');
   if(active>=2){json(res,429,{code:'IMAGE_BUSY'});return true;}active++;
   try{
    const publicId=new RegExp('^'+prefix+'/public/([a-f0-9-]{36})$').exec(u.pathname);
    if(publicId&&req.method==='GET'){assertEmptyShopRequest(req);const body=await api.public({id:publicId[1]});res.writeHead(200,{...headers,'Content-Type':'image/png','Content-Length':String(body.length),'Content-Security-Policy':"default-src 'none'; sandbox"});res.end(body);return true;}
    if(req.headers['sec-fetch-site']==='cross-site'||req.headers.origin&&req.headers.origin!==publicOrigin)throw Error('FORBIDDEN');
    const auth=/^Bearer ([^\s]{1,512})$/i.exec(req.headers.authorization||'');if(!auth)throw Error('UNAUTHORIZED');
    const match=new RegExp('^'+prefix+'/(offer-[a-f0-9-]{36})(/remove)?$').exec(u.pathname);if(!match)throw Error('INVALID_REQUEST');
    const token=auth[1],id=match[1];await shopActor(pool,sessionHash(token));let result;
    if(req.method==='GET'&&!match[2]){assertEmptyShopRequest(req);result=await api.own({token,id});}
    else if(req.method==='POST'){
     if(req.headers.origin!==publicOrigin)throw Error('FORBIDDEN');
     if(match[2]){if(!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(req.headers['content-type']||''))throw Error('INVALID_REQUEST');const body=await readShopRequestBody(req,{maxBytes:256,timeoutMs:15000});if(Object.keys(body).join()!=='expectedRevision')throw Error('INVALID_REQUEST');result=await api.remove({token,id,...body});}
     else{
      await api.own({token,id});
      if(!['image/png','image/jpeg'].includes(req.headers['content-type'])||req.headers['content-encoding']&&req.headers['content-encoding']!=='identity'||!/^\d{1,10}$/.test(req.headers['x-image-revision']||''))throw Error('INVALID_IMAGE');
      const length=req.headers['content-length'];if(length!==undefined&&(!/^\d+$/.test(length)||Number(length)>imageLimits.maxBytes))throw Error('BODY_TOO_LARGE');
      const bytes=await documentRequestBytes(req,15000);
      result=await api.upload({token,id,requestId:req.headers['x-image-id'],expectedRevision:Number(req.headers['x-image-revision']),bytes,mime:req.headers['content-type']});
     }
    }else{json(res,405,{code:'METHOD_NOT_ALLOWED'});return true;}
    json(res,200,result);return true;
   }finally{active--;}
  }catch(e){const code=e.code||e.message;json(res,errors[code]||503,{code:errors[code]?code:'IMAGE_UNAVAILABLE'});if(!req.readableEnded){req.pause?.();res.once?.('finish',()=>req.destroy?.());}return true;}
 }};
}
