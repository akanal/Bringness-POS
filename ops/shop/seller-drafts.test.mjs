import {test} from 'node:test';import assert from 'node:assert/strict';import crypto from 'node:crypto';import http from 'node:http';
import {fixture} from './fixture.mjs';import {migrateSellerDrafts,writeSellerDraft,readSellerDraft,listSellerDrafts,sellerDraftHistory,sellerCommand} from '../../server/shop-seller-drafts.js';import {createSellerRuntime} from '../../server/shop-seller-http.js';
const offer={title:'Fixture offer',category:'Baumarkt',kind:'physical',price:'12,50',tax:'19',stock:'5',gtin:'',condition:'new',sku:'Fixture-1',description:'A fixture product description used only in an isolated database for checks.',delivery:'Fixture delivery within five days.',fulfilment:''};
const command=(data={})=>({id:'offer-'+crypto.randomUUID(),requestId:crypto.randomUUID(),expectedRevision:0,action:'save',offer:{...offer},...data});
const write=(f,c,token='owner-a')=>writeSellerDraft(f.pool,{token,command:c});
const rejects=(fn,code)=>assert.rejects(fn,error=>error.code===code);
test('seller schema is repeatable and canonical commands reject untrusted fields, invalid offers and revisions',async()=>{
 const f=await fixture();try{await migrateSellerDrafts(f.pool);await migrateSellerDrafts(f.pool);const value=sellerCommand(command());assert.equal(value.offer.netCents,1250);
 for(const change of [{companyId:f.b},{expectedRevision:-1},{expectedRevision:1.5},{action:'publish'},{id:'bad'},{offer:{...offer,price:'1e6'}},{offer:{...offer,category:'Unknown'}}])assert.throws(()=>sellerCommand({...command(),...change}));
 await rejects(()=>listSellerDrafts(f.pool,{token:'waiter'}),'FORBIDDEN');for(const token of ['bad','expired','inactive','reset'])await rejects(()=>listSellerDrafts(f.pool,{token}),'UNAUTHORIZED');
 }finally{await f.db.close();}
});
test('seller writes are tenant-scoped, versioned, replayable and independent from payments',async()=>{
 const f=await fixture();try{await migrateSellerDrafts(f.pool);const first=command(),saved=await write(f,first);assert.equal(saved.revision,1);assert.equal(saved.canPublish,false);assert.equal((await write(f,first)).replay,true);
 await rejects(()=>write(f,{...first,offer:{...offer,title:'Changed replay'}}),'REQUEST_CONFLICT');await rejects(()=>readSellerDraft(f.pool,{token:'owner-b',id:first.id}),'OFFER_NOT_FOUND');
 const second=command({id:first.id,expectedRevision:1,offer:{...offer,title:'Second version'}});assert.equal((await write(f,second)).revision,2);await rejects(()=>write(f,command({id:first.id,expectedRevision:1})),'REVISION_CONFLICT');
 assert.equal((await write(f,first)).revision,1);assert.equal((await readSellerDraft(f.pool,{token:'owner-a',id:first.id})).offer.title,'Second version');
 const archive=command({id:first.id,expectedRevision:2,action:'archive'});delete archive.offer;assert.equal((await write(f,archive)).state,'archived');assert.equal((await write(f,archive)).replay,true);await rejects(()=>write(f,command({id:first.id,expectedRevision:3})),'OFFER_ARCHIVED');
 const restore=command({id:first.id,expectedRevision:3,action:'restore'});delete restore.offer;assert.equal((await write(f,restore)).revision,4);
 const past=await readSellerDraft(f.pool,{token:'owner-a',id:first.id,revision:1});assert.equal(past.offer.title,offer.title);assert.equal(past.revision,4);assert.equal(past.sourceRevision,1);
 const history=await sellerDraftHistory(f.pool,{token:'owner-a',id:first.id});assert.deepEqual(history.versions.map(v=>v.action),['restore','archive','save','save']);
 assert.equal((await listSellerDrafts(f.pool,{token:'owner-a',query:'Second'})).offers.length,1);assert.equal((await listSellerDrafts(f.pool,{token:'owner-b'})).offers.length,0);assert.equal((await listSellerDrafts(f.pool,{token:'owner-a',query:"' OR 1=1 --"})).offers.length,0);
 const receiptCount=(await f.db.query('SELECT count(*) AS n FROM shop_seller_requests')).rows[0].n;assert.equal(Number(receiptCount),4);assert.equal((await f.db.query('SELECT * FROM billing_transactions')).rows.length,0);assert.equal((await f.db.query('SELECT * FROM company_entitlements')).rows.length,0);
 await f.db.query("UPDATE users SET status='inactive' WHERE company_id=$1",[f.a]);await rejects(()=>readSellerDraft(f.pool,{token:'owner-a',id:first.id}),'UNAUTHORIZED');
 }finally{await f.db.close();}
});
test('seller list pagination never exceeds 25 rows and archive/history do not cross accounts',async()=>{
 const f=await fixture();try{await migrateSellerDrafts(f.pool);const id=command().id;await write(f,command({id}));
 await f.db.query("INSERT INTO shop_seller_offers(company_id,id,revision,state,payload) SELECT $1,'offer-00000000-0000-4000-8000-'||lpad(n::text,12,'0'),1,'draft',$2 FROM generate_series(1,26) n",[f.a,JSON.stringify(sellerCommand(command()).offer)]);
 const page=await listSellerDrafts(f.pool,{token:'owner-a'});assert.equal(page.offers.length,25);assert.ok(page.nextCursor);const next=await listSellerDrafts(f.pool,{token:'owner-a',cursor:page.nextCursor});assert.equal(next.offers.length,2);assert.equal(next.nextCursor,null);assert.equal(new Set([...page.offers,...next.offers].map(r=>r.id)).size,27);
 await rejects(()=>sellerDraftHistory(f.pool,{token:'owner-b',id}),'OFFER_NOT_FOUND');const archive=command({id,expectedRevision:1,action:'archive'});delete archive.offer;await rejects(()=>write(f,archive,'owner-b'),'REVISION_CONFLICT');assert.equal((await readSellerDraft(f.pool,{token:'owner-a',id})).state,'draft');
 }finally{await f.db.close();}
});
test('seller HTTP stays disabled by default and enforces origin, body and authorization boundaries',async()=>{
 assert.equal(await createSellerRuntime({query(){assert.fail();}}).handle({},{}),false);
 const f=await fixture(),runtime=createSellerRuntime(f.pool,{enabled:true,publicOrigin:'https://fixture.example.test'});await runtime.migrate();const server=http.createServer(async(req,res)=>{if(!await runtime.handle(req,res)){res.writeHead(404);res.end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}/api/v1/shop/seller/offers`,headers={Authorization:'Bearer owner-a',Origin:'https://fixture.example.test','Content-Type':'application/json'};
 try{
 assert.equal((await fetch(url)).status,401);assert.equal((await fetch(url,{headers:{Authorization:'Bearer waiter'}})).status,403);
 assert.equal((await fetch(url,{method:'POST',headers:{...headers,Origin:'https://evil.test'},body:JSON.stringify(command())})).status,403);
 assert.equal((await fetch(url,{method:'POST',headers,body:'[]'})).status,400);assert.equal((await fetch(url,{method:'POST',headers,body:'x'.repeat(33000)})).status,413);
 const c=command(),response=await fetch(url,{method:'POST',headers,body:JSON.stringify(c)});assert.equal(response.status,200);const value=await response.json();assert.equal(value.revision,1);assert.equal(value.canPublish,false);assert.equal(response.headers.get('cache-control'),'no-store');
 const foreign=await fetch(url+'/'+c.id,{headers:{Authorization:'Bearer owner-b'}});assert.equal(foreign.status,404);assert.equal((await fetch(url+'?company='+f.b,{headers})).status,400);assert.equal((await fetch(url+'/'+c.id,{method:'DELETE',headers})).status,405);
 }finally{await new Promise(r=>server.close(r));await f.db.close();}
});
