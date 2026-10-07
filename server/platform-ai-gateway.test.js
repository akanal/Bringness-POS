import {test} from 'node:test';import assert from 'node:assert/strict';import {Readable} from 'node:stream';import {createPlatformAiGateway} from './platform-ai-gateway.js';import {handlePlatformAiAssets} from './platform-ai-assets.js';
async function call(handle,url,token='admin',method='GET',body=''){let status,data;const req=Readable.from(body?[body]:[]);Object.assign(req,{url,method,headers:token?{authorization:'Bearer '+token}:{}});const handled=await handle(req,{writeHead(s){status=s},end(value){data=value}});return {handled,status,data}}
test('gateway rejects tenant/expired/reset accounts before forwarding and bounds requests',async()=>{
 let forwarded=0;const db={query:async(sql,args)=>{assert.match(sql,/platform_admins/);assert.match(sql,/must_change_password/);return {rows:args[0]===await import('node:crypto').then(c=>c.createHash('sha256').update('admin').digest('hex'))?[{id:'owner'}]:[]}}};
 const handler=createPlatformAiGateway(db,{fetcher:async(url,options)=>{forwarded++;assert.equal(url.origin,'https://bringness-ai.com');assert.equal(options.redirect,'error');assert.equal(options.headers.authorization,'Bearer admin');return new Response(JSON.stringify({name:'Rührei'}),{headers:{'content-type':'application/json'}})}});
 assert.equal((await call(handler,'/api/v1/platform/ai/overview','')).status,401);assert.equal((await call(handler,'/api/v1/platform/ai/overview','tenant')).status,403);assert.equal(forwarded,0);
 assert.equal((await call(handler,'/api/v1/platform/ai/overview')).status,200);assert.equal(JSON.parse((await call(handler,'/api/v1/platform/ai/')).data).name,'Rührei');
 assert.equal((await call(handler,'/api/v1/platform/ai/%2fsecret')).status,400);assert.equal((await call(handler,'/api/v1/platform/ai/overview','admin','DELETE')).status,405);assert.equal((await call(handler,'/api/v1/platform/ai/launch','admin','POST','x'.repeat(16001))).status,413);
});
test('gateway does not follow redirects or return malformed/oversized upstream responses',async()=>{
 const db={query:async()=>({rows:[{id:'owner'}]})};
 for(const response of [new Response('<html>Login</html>',{headers:{'content-type':'text/html'}}),new Response('x'.repeat(2*1024*1024+1),{headers:{'content-type':'application/json'}})])assert.equal((await call(createPlatformAiGateway(db,{fetcher:async()=>response}),'/api/v1/platform/ai/overview')).status,503);
 assert.throws(()=>createPlatformAiGateway(db,{origin:'http://unsafe.example'}));
});
test('managed assets reuse AI interface and reject unknown files',async()=>{
 const html=await call(handlePlatformAiAssets,'/admin/ai-workspace.html?admin=1');assert.equal(html.status,200);assert.match(html.data,/\/admin\/ai-assets\/ai-workspace.js/);assert.doesNotMatch(html.data,/src="\/ai-/);assert.match(html.data,/href="\/admin\/"/);
 assert.equal((await call(handlePlatformAiAssets,'/admin/ai-assets/ai-csv-parser.js')).status,200);assert.equal((await call(handlePlatformAiAssets,'/admin/ai-assets/not-allowed.js')).status,404);
});
