import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
const env=Object.fromEntries((await readFile(process.argv[2]||'.env.preview.local','utf8')).trim().split('\n').map(line=>{const at=line.indexOf('=');return [line.slice(0,at),line.slice(at+1)];}));
const stateFile=process.argv[3];
let previous;
if(stateFile){try{previous=JSON.parse(await readFile(stateFile,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}}
const base='http://127.0.0.1:3016';
const anonymous=await fetch(base+'/health');assert.equal(anonymous.status,401);assert.match(anonymous.headers.get('x-robots-tag'),/noindex/);
const basic='Basic '+Buffer.from('bringness-preview:'+env.PREVIEW_ACCESS_PASSWORD).toString('base64');
const health=await fetch(base+'/health',{headers:{authorization:basic}});assert.equal(health.status,200);const healthData=await health.json();assert.equal(healthData.preview.isolated,true);assert.equal(healthData.waiterPush,'disabled_preview');
const cookie=health.headers.get('set-cookie')?.split(';')[0];assert(cookie);assert.match(health.headers.get('set-cookie'),/HttpOnly; Secure; SameSite=Strict/);assert.match(health.headers.get('content-security-policy'),/connect-src 'self'/);
async function request(path,{method='GET',body,token}={}){
 const response=await fetch(base+path,{method,headers:{cookie,...(token?{authorization:'Bearer '+token}:{}),'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
 return {status:response.status,data:await response.json()};
}
for(const path of ['/pos/','/ai-workspace.html']){const res=await fetch(base+path,{headers:{cookie}});assert.equal(res.status,200);const html=await res.text();assert.match(html,path==='/pos/'?/\/pos\/app\.js/:/\/ai-workspace\.js/);assert(!html.includes('standalone simulation'));}
// Reject malformed or unbounded public login payloads before database/auth work.
for(const raw of ['null','[]','42','{bad']){
 const response=await fetch(base+'/api/v1/auth/login',{method:'POST',headers:{cookie,'content-type':'application/json'},body:raw});assert.equal(response.status,400);
}
const oversizedLogin=await fetch(base+'/api/v1/auth/login',{method:'POST',headers:{cookie,'content-type':'application/json'},body:JSON.stringify({padding:'x'.repeat(4*1024*1024)})});assert.equal(oversizedLogin.status,413);
const login=await request('/api/v1/auth/login',{method:'POST',body:{email:'preview@example.test',password:env.PREVIEW_OWNER_PASSWORD}});assert.equal(login.status,200);assert.equal(typeof login.data.token,'string');const token=login.data.token;
for(const path of ['/api/v1/support/message','/api/v1/admin/password/change','/api/v1/staff/confirm']){
 const response=await fetch(base+path,{method:'POST',headers:{cookie,authorization:'Bearer '+token,'content-type':'application/json'},body:'null'});assert.equal(response.status,400);
}
const bootstrap=await request('/api/v1/bootstrap',{token});assert.equal(bootstrap.status,200);assert.equal(bootstrap.data.restaurants.length,1);assert.equal(bootstrap.data.products.length,2);
const product=bootstrap.data.products.find(p=>p.name==='Vorschau Kaffee');assert(product);
const sale=previous?.sale||{requestKey:crypto.randomUUID(),restaurantId:bootstrap.data.restaurants[0].id,items:[{productId:product.id,qty:1}],payments:[{method:'cash',amountCents:250}]};
const paid=await request('/api/v1/orders/checkout',{method:'POST',body:sale,token});assert.equal(paid.status,previous?200:201);if(previous){assert.equal(paid.data.id,previous.orderId);assert.equal(paid.data.replayed,true);}const replay=await request('/api/v1/orders/checkout',{method:'POST',body:sale,token});assert.equal(replay.status,200);assert.equal(replay.data.id,paid.data.id);assert.equal(replay.data.replayed,true);
for(const path of ['/api/v1/billing/checkout','/api/v1/mollie/webhook','/api/v1/fiskaly-test/setup','/api/v1/tse/sign','/api/ai/automatic-procurement/run','/api/ai/collection/setup']){const blocked=await request(path,{method:'POST',body:{},token});assert.equal(blocked.status,403);assert.equal(blocked.data.code,'PREVIEW_ACTION_DISABLED');}
const aiLogin=await request('/api/ai/login',{method:'POST',body:{email:'preview@example.test',password:env.PREVIEW_OWNER_PASSWORD}});assert.equal(aiLogin.status,200);assert.equal(typeof aiLogin.data.token,'string');const stock=await request('/api/ai/stock',{token:aiLogin.data.token});assert.equal(stock.status,200);assert.equal(stock.data.stock.length,1);assert.equal(stock.data.stock[0].name,'Vorschau Mehl');
for(const [prefix,auth,paths] of [
 ['/api/v1/',token,['orders/checkout','tables/settle','offline/batch','accountant/grants']],
 ['/api/ai/',aiLogin.data.token,['login','cart/preview','inventory/count','delivery-notes/upload']]
])for(const path of paths){
 const response=await fetch(base+prefix+path,{method:'POST',headers:{cookie,authorization:'Bearer '+auth,'content-type':'application/json'},body:'null'});
 assert.equal(response.status,400,'Invalid JSON object: '+prefix+path);const result=await response.json();assert.equal(typeof result.error,'string');
}
const rid=bootstrap.data.restaurants[0].id;
for(const [path,auth,body] of [
 ['/api/v1/guest/order-v2',token,{code:'a'.repeat(48),requestId:crypto.randomUUID(),items:[null]}],
 ['/api/v1/products/'+product.id+'/extras',token,null],
 ['/api/ai/cart/preview',aiLogin.data.token,{deliveryDate:'2026-10-17',lines:[null]}],
 ['/api/ai/purchase-requests',aiLogin.data.token,{locationId:rid,requestKey:crypto.randomUUID(),deliveryDate:'2026-10-17',lines:[null]}],
 ['/api/ai/delivery-notes/prices',aiLogin.data.token,{id:rid,confirmed:true,lines:[null]}]
]){
 const response=await fetch(base+path,{method:'POST',headers:{cookie,authorization:'Bearer '+auth,'content-type':'application/json'},body:JSON.stringify(body)});assert.equal(response.status,400,'Nested request validation: '+path);
}
const revoked=await fetch(base+'/health',{headers:{cookie:cookie+'tampered'}});assert.equal(revoked.status,401);
if(stateFile&&!previous)await writeFile(stateFile,JSON.stringify({sale,orderId:paid.data.id})+'\n',{flag:'wx',mode:0o600});
console.log('Isolated preview smoke passed: access protection, actual POS/AI assets and logins, idempotent synthetic cash sale, separate AI stock, cookie tamper and forbidden provider actions.');
