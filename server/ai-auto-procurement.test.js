import test from 'node:test';
import assert from 'node:assert/strict';
import {automaticProcurementTick,runAutomaticProcurement} from './ai-auto-procurement.js';
import {cartTransaction} from './ai-cart.js';

test('automatic procurement isolates account failures and prevents overlapping worker batches',async()=>{
 const accounts=[{id:'broken',role:'restaurant'},{id:'healthy',role:'restaurant'}];
 const db={query:async()=>({rows:accounts})};
 const seen=[];let errors=0,release;
 const gate=new Promise(resolve=>{release=resolve});
 const task=automaticProcurementTick({db,onError:()=>{errors++},run:async(user,options)=>{
  assert.equal(options.db,db);
  seen.push(user.id);
  if(user.id==='broken'){await gate;throw Error('private database information');}
 }});
 await automaticProcurementTick({db,run:async()=>assert.fail('overlapping batch')});
 release();await task;
 assert.deepEqual(seen,['broken','healthy']);assert.equal(errors,1);
 // The worker resets its guard even after an individual account failed.
 await automaticProcurementTick({db,run:async user=>seen.push(user.id)});
 assert.equal(seen.length,4);
});

test('automatic procurement checks the live Berlin day before committing and shares its database',async()=>{
 const day='2026-10-16',updates=[];
 const policy={enabled:true,days:2,leadDays:1,maxDailyNetCents:10000,supplierIds:['supplier'],supplierTerms:{supplier:['Berlin','terms',0]}};
 const db={query:async(sql,args)=>{
  if(sql.startsWith('SELECT * FROM ai_auto_procurement '))return {rows:[{policy,version:1}]};
  if(sql.startsWith('INSERT INTO ai_auto_procurement_runs'))return {rows:[{id:'run',state:'pending'}]};
  if(sql.startsWith('SELECT state'))return {rows:[{state:'pending'}]};
  updates.push({sql,args});return {rows:[]};
 }};
 const lines=[{stockId:'stock',productId:'product',packs:1}],quote={netCents:100,groups:[{supplierId:'supplier',deliveryArea:'Berlin',terms:'terms',minimumCents:0}]};
 let draftCalls=0,created=0;
 const draft=async(_user,body,options)=>{
  assert.equal(options.db,db);assert.equal(body.deliveryDate,'2026-10-17');draftCalls++;
  return {complete:true,lines};
 };
 const cart=async(_db,_user,_body,options)=>{
  if(options.checkout===false)return {canOrder:true,quote};
  await options.authorize(db,quote);created++;
  await options.onCreated(db,{quote,orders:[{id:'order'}]});return {orders:[{id:'order'}]};
 };
 const user={id:'buyer',role:'restaurant'};
 const initial=new Date(day+'T12:00:00Z');
 const result=await runAutomaticProcurement(user,{db,draft,cart,now:initial,clock:()=>new Date('2026-10-16T22:01:00Z')});
 assert.equal(result.state,'blocked');assert.match(result.error,/Kalendertag/);assert.equal(created,0);
 const success=await runAutomaticProcurement(user,{db,draft,cart,now:initial,clock:()=>initial});
 assert.equal(success.state,'ordered');assert.equal(created,1);assert.equal(draftCalls,3);
 assert.ok(updates.some(u=>u.sql.includes("state='ordered'")));
});

test('cart rechecks active restaurant permission inside the transaction before replay or ordering',async()=>{
 for(const buyer of [null,{role:'restaurant',status:'suspended'},{role:'dealer',status:'active'}]){
  const calls=[];let released=false;
  const db={connect:async()=>({query:async sql=>{
   calls.push(sql);if(sql.startsWith('SELECT * FROM ai_accounts'))return {rows:buyer?[buyer]:[]};
   return {rows:[]};
  },release(){released=true;}})};
  await assert.rejects(cartTransaction(db,{id:'buyer',role:'restaurant'},
   {lines:[{stockId:'11111111-1111-4111-8111-111111111111',productId:'22222222-2222-4222-8222-222222222222',packs:1}],deliveryDate:'2026-10-17',requestKey:'33333333-3333-4333-8333-333333333333',confirmed:true}),e=>e.status===403);
  assert.equal(calls.at(-1),'ROLLBACK');assert.equal(released,true);
  assert.equal(calls.some(sql=>sql.includes('ai_checkouts')),false);
  assert.equal(calls.some(sql=>sql.includes('INSERT INTO ai_orders')),false);
 }
});
