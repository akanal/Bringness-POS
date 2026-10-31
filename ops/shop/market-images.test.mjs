import test from 'node:test';import assert from 'node:assert/strict';import crypto from 'node:crypto';
import {createCanvas} from '@napi-rs/canvas';
import {fixture} from './fixture.mjs';
import {migrateMarketplace,publishMarketplace,listMarketplace} from '../../server/shop-marketplace.js';
import {writeSellerDraft} from '../../server/shop-seller-drafts.js';
import {createMarketplaceImages,normalizeMarketplaceImage,marketplaceImageKey} from '../../server/shop-marketplace-images.js';
import {documentObjectKey} from '../../server/idrive-document-store.js';
const png=()=>createCanvas(3,2).toBuffer('image/png');
const profile={name:'Synthetic seller',street:'Test 1',postalCode:'10115',city:'Berlin',country:'DE',email:'seller@example.test'};
async function setup(){const f=await fixture();await migrateMarketplace(f.pool);const id='offer-'+crypto.randomUUID();await f.db.query("INSERT INTO shop_market_sellers(company_id,status,profile) VALUES($1,'approved',$2)",[f.a,profile]);await writeSellerDraft(f.pool,{token:'owner-a',command:{id,requestId:crypto.randomUUID(),action:'save',expectedRevision:0,offer:{title:'Test image item',category:'Hardware',kind:'physical',price:'1,00',tax:'19',stock:'5',gtin:'',condition:'new',sku:'S',description:'Synthetic item',delivery:'3 days',fulfilment:''}}});const objects=new Map();let puts=0,gets=0;const store={async putExact(r,b){puts++;objects.set(r.id,Buffer.from(b));},async getExact(r){gets++;return objects.get(r.id);}};const api=createMarketplaceImages(f.pool,store);const command={token:'owner-a',id,requestId:crypto.randomUUID(),expectedRevision:0,mime:'image/png',bytes:png()};const publish=()=>publishMarketplace(f.pool,{token:'owner-a',command:{id,requestId:crypto.randomUUID(),action:'publish',expectedRevision:0,sourceRevision:1,publication:{variants:[{sku:'S',label:'Standard',netCents:100,vatBasisPoints:1900,stock:5}],shipping:true,pickup:false,shippingNetCents:0,shippingVatBasisPoints:1900,delivery:'3 days',pickupAddress:''}}});return {...f,id,api,store,command,publish,objects,counts:()=>({puts,gets})};}
const run=fn=>async()=>{const f=await setup();try{await fn(f);}finally{await f.db.close();}};
test('images are decoded/re-encoded; invalid formats, excessive dimensions and claimed types rejected',async()=>{
 const p=png(),r=await normalizeMarketplaceImage(p,'image/png');assert.equal(r.width,3);assert.equal(r.height,2);assert.equal(r.mime,'image/png');assert.ok(Buffer.isBuffer(r.body));
 const jpeg=createCanvas(4,3).toBuffer('image/jpeg');assert.equal((await normalizeMarketplaceImage(jpeg,'image/jpeg')).width,4);
 for(const [b,m]of [[p,'image/jpeg'],[Buffer.from('<svg onload=alert(1)>'),'image/png'],[Buffer.from('%PDF-123'),'image/png'],[p,'image/svg+xml']])await assert.rejects(()=>normalizeMarketplaceImage(b,m),/INVALID_IMAGE/);
 const huge=Buffer.from(p);huge.writeUInt32BE(100000,16);await assert.rejects(()=>normalizeMarketplaceImage(huge,'image/png'),/INVALID_IMAGE/);
 const company=crypto.randomUUID(),id=crypto.randomUUID(),sha='a'.repeat(64);assert.notEqual(marketplaceImageKey(company,id,sha),documentObjectKey(company,id,sha));
});
test('upload remains private until explicit publication; private documents cannot be public images',run(async f=>{
 const r=await f.api.upload(f.command);assert.equal(r.revision,1);assert.equal(r.imageId,f.command.requestId);await assert.rejects(()=>f.api.public({id:r.imageId}),/IMAGE_NOT_FOUND/);assert.equal(f.counts().gets,0);
 await f.publish();const offers=(await listMarketplace(f.pool)).offers;assert.equal(offers[0].imageUrl,r.url);assert.deepEqual(await f.api.public({id:r.imageId}),f.objects.get(r.imageId));
 await assert.rejects(()=>f.api.public({id:crypto.randomUUID()}),/IMAGE_NOT_FOUND/);
}));
test('tenant, role and approval guards prevent foreign image uploads, reads and deletion',run(async f=>{
 for(const token of ['owner-b','waiter','inactive','expired','reset']){await assert.rejects(()=>f.api.upload({...f.command,token}));await assert.rejects(()=>f.api.own({token,id:f.id}));}
 assert.equal(f.counts().puts,0);const r=await f.api.upload(f.command);await assert.rejects(()=>f.api.remove({token:'owner-b',id:f.id,expectedRevision:1}));assert.equal((await f.api.own({token:'owner-a',id:f.id})).imageId,r.imageId);
 await f.db.query("UPDATE shop_market_sellers SET status='suspended' WHERE company_id=$1",[f.a]);await assert.rejects(()=>f.api.upload({...f.command,requestId:crypto.randomUUID(),expectedRevision:1}),/SELLER_NOT_APPROVED/);
}));
test('lost reply replays once, conflicting IDs and stale replacements cannot overwrite image',run(async f=>{
 const r=await f.api.upload(f.command);assert.equal((await f.api.upload(f.command)).replay,true);assert.equal(f.counts().puts,1);
 await assert.rejects(()=>f.api.upload({...f.command,bytes:createCanvas(4,4).toBuffer('image/png')}),/IMAGE_CONFLICT/);
 await assert.rejects(()=>f.api.upload({...f.command,requestId:crypto.randomUUID()}),/REVISION_CONFLICT/);
 const second=await f.api.upload({...f.command,requestId:crypto.randomUUID(),expectedRevision:1});assert.equal(second.revision,2);await f.publish();await assert.rejects(()=>f.api.public({id:r.imageId}),/IMAGE_NOT_FOUND/);
 await assert.rejects(()=>f.api.upload(f.command),/REVISION_CONFLICT/);
}));
test('remove is revisioned and retryable; old image and suspended/withdrawn offers stop serving',run(async f=>{
 const r=await f.api.upload(f.command);await f.publish();await f.api.public({id:r.imageId});
 const remove={token:'owner-a',id:f.id,expectedRevision:1};assert.equal((await f.api.remove(remove)).revision,2);assert.equal((await f.api.remove(remove)).replay,true);await assert.rejects(()=>f.api.public({id:r.imageId}),/IMAGE_NOT_FOUND/);
 const next=await f.api.upload({...f.command,requestId:crypto.randomUUID(),expectedRevision:2});await f.db.query("UPDATE shop_market_sellers SET status='suspended' WHERE company_id=$1",[f.a]);await assert.rejects(()=>f.api.public({id:next.imageId}),/IMAGE_NOT_FOUND/);
 await f.db.query("UPDATE shop_market_sellers SET status='approved' WHERE company_id=$1",[f.a]);await f.db.query("UPDATE shop_market_publications SET state='withdrawn' WHERE id=$1",[f.id]);await assert.rejects(()=>f.api.public({id:next.imageId}),/IMAGE_NOT_FOUND/);
}));
test('durable quota bounds failed storage attempts; account switch during I/O cannot attach image',run(async f=>{
 const broken=createMarketplaceImages(f.pool,{...f.store,putExact:async()=>{throw Error('synthetic unavailable');}});
 for(let n=0;n<20;n++)await assert.rejects(()=>broken.upload({...f.command,requestId:crypto.randomUUID()}),/synthetic unavailable/);
 await assert.rejects(()=>broken.upload({...f.command,requestId:crypto.randomUUID()}),/IMAGE_QUOTA/);
 assert.equal((await f.api.own({token:'owner-a',id:f.id})).revision,0);
 const intent=(await f.db.query('SELECT id FROM shop_market_image_intents LIMIT 1')).rows[0];const switched=createMarketplaceImages(f.pool,{...f.store,putExact:async()=>{await f.db.query('UPDATE users SET company_id=$1 WHERE company_id=$2',[f.b,f.a]);}});
 await assert.rejects(()=>switched.upload({...f.command,requestId:intent.id}),/ACCOUNT_CHANGED/);
}));

test('HTTP images enforce authentication/origin and serve PNG only through public publication binding',run(async f=>{
 const {createMarketplaceImagesRuntime}=await import('../../server/shop-marketplace-images-http.js');const http=await import('node:http');const runtime=createMarketplaceImagesRuntime(f.pool,{enabled:true,store:f.store});await runtime.migrate();const server=http.createServer(async(req,res)=>{if(!await runtime.handle(req,res)){res.writeHead(404);res.end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{const base='http://127.0.0.1:'+server.address().port+'/api/v1/shop/marketplace/images',url=base+'/'+f.id;
  assert.equal((await fetch(url)).status,401);assert.equal((await fetch(url,{headers:{Authorization:'Bearer owner-b'}})).status,404);
  const headers={Authorization:'Bearer owner-a',Origin:'https://bringness.de','Content-Type':'image/png','X-Image-Id':f.command.requestId,'X-Image-Revision':'0'};
  assert.equal((await fetch(url,{method:'POST',headers:{...headers,Origin:'https://evil.test'},body:png()})).status,403);
  const uploaded=await fetch(url,{method:'POST',headers,body:png()});assert.equal(uploaded.status,200);const image=await uploaded.json();
  assert.equal((await fetch(base+'/public/'+image.imageId)).status,404);await f.publish();const publicImage=await fetch(base+'/public/'+image.imageId);assert.equal(publicImage.status,200);assert.equal(publicImage.headers.get('content-type'),'image/png');assert.equal(publicImage.headers.get('cache-control'),'no-store');assert.equal(publicImage.headers.get('cross-origin-resource-policy'),'same-origin');assert.deepEqual(Buffer.from(await publicImage.arrayBuffer()),f.objects.get(image.imageId));
  assert.equal((await fetch(base+'/public/'+image.imageId+'?companyId='+f.a)).status,400);
  assert.equal((await fetch(url+'/remove',{method:'POST',headers:{Authorization:'Bearer owner-a',Origin:'https://bringness.de','Content-Type':'application/json'},body:JSON.stringify({expectedRevision:1})})).status,200);assert.equal((await fetch(base+'/public/'+image.imageId)).status,404);
 }finally{await new Promise(r=>server.close(r));}
}));

test('IDrive image adapter uses separate namespace and never changes private document key defaults',async()=>{
 const {createIdriveDocumentStore}=await import('../../server/idrive-document-store.js');const {Readable}=await import('node:stream');
 class Put{constructor(input){this.input=input;}}class Get{constructor(input){this.input=input;}}class Policy{constructor(input){this.input=input;}}
 const objects=new Map(),keys=[],client={async send(command){const p=command.input;if(command instanceof Policy)throw Object.assign(Error(),{name:'NoSuchBucketPolicy',$metadata:{httpStatusCode:404}});keys.push(p.Key);if(command instanceof Put){objects.set(p.Key,p);return {};}const old=objects.get(p.Key);return {ServerSideEncryption:'AES256',ContentLength:old.ContentLength,ContentType:old.ContentType,Metadata:old.Metadata,Body:Readable.from([old.Body])};}};
 const bytes=png(),record={company:crypto.randomUUID(),id:crypto.randomUUID(),sha:crypto.createHash('sha256').update(bytes).digest('hex'),requestDigest:'b'.repeat(64),size:bytes.length,mime:'image/png'};
 const imageStore=createIdriveDocumentStore({client,PutObjectCommand:Put,GetObjectCommand:Get,GetBucketPolicyCommand:Policy,objectKey:marketplaceImageKey}),privateStore=createIdriveDocumentStore({client,PutObjectCommand:Put,GetObjectCommand:Get,GetBucketPolicyCommand:Policy});
 await imageStore.putExact(record,bytes);assert.deepEqual(await imageStore.getExact(record),bytes);await privateStore.putExact(record,bytes);assert.equal(objects.size,2);assert.ok(keys[0].startsWith('marketplace/product-images/'));assert.ok(keys.at(-1).startsWith('documents/accounts/'));assert.notEqual(keys[0],keys.at(-1));
});
