import test from 'node:test';
import assert from 'node:assert/strict';
import {automaticProcurementTick,runAutomaticProcurement,saveProcurementPolicy} from './ai-auto-procurement.js';
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

test('a competing committed daily order wins over stale no-need and blocked results',async()=>{
 for(const complete of [true,false]){
  let ordered=false,carts=0;
  const policy={enabled:true,days:2,leadDays:1,supplierIds:['supplier']};
  const db={query:async sql=>{
   if(sql.startsWith('SELECT * FROM ai_auto_procurement '))return {rows:[{policy,version:1}]};
   if(sql.startsWith('INSERT INTO ai_auto_procurement_runs'))return {rows:[{id:'daily',state:'pending'}]};
   if(sql.startsWith('SELECT state,net_cents'))return {rows:[{state:ordered?'ordered':'pending',net_cents:12500}]};
   return {rows:[],rowCount:0};
  }};
  const result=await runAutomaticProcurement({id:'buyer',role:'restaurant'},{db,
   draft:async()=>{ordered=true;return {complete,lines:[],unresolved:[{reason:'another worker already sent the order'}]};},
   cart:async()=>{carts++;assert.fail('stale plan must not order');}
  });
  assert.deepEqual(result,{state:'ordered',replayed:true,netCents:12500});assert.equal(carts,0);
 }
});

test('lost checkout confirmation reports the durable committed order and never orders twice',async()=>{
 let ordered=false,checkouts=0;
 const policy={enabled:true,days:2,leadDays:1,supplierIds:['supplier']};
 const db={query:async sql=>{
  if(sql.startsWith('SELECT * FROM ai_auto_procurement '))return {rows:[{policy,version:1}]};
  if(sql.startsWith('INSERT INTO ai_auto_procurement_runs'))return {rows:[{id:'daily',state:ordered?'ordered':'pending',net_cents:900}]};
  if(sql.startsWith('SELECT state,net_cents'))return {rows:[{state:ordered?'ordered':'pending',net_cents:900}]};
  return {rows:[],rowCount:0};
 }};
 const options={db,draft:async()=>({complete:true,lines:[{stockId:'stock',productId:'product',packs:1}]}),cart:async(_db,_user,_body,config)=>{
  if(config.checkout===false)return {canOrder:true,quote:{netCents:900}};
  checkouts++;ordered=true;throw Error('commit acknowledgement lost');
 }};
 const user={id:'buyer',role:'restaurant'};
 assert.deepEqual(await runAutomaticProcurement(user,options),{state:'ordered',replayed:true,netCents:900});
 assert.deepEqual(await runAutomaticProcurement(user,options),{state:'ordered',replayed:true,netCents:900});
 assert.equal(checkouts,1);
});


test('automatic checkout refuses an empty supplier quote without creating an order',async()=>{
 const policy={enabled:true,days:2,leadDays:1,maxDailyNetCents:10000,supplierIds:['supplier']};
 const db={query:async sql=>{
  if(sql.startsWith('SELECT * FROM ai_auto_procurement '))return {rows:[{policy,version:1}]};
  if(sql.startsWith('INSERT INTO ai_auto_procurement_runs'))return {rows:[{id:'daily',state:'pending'}]};
  if(sql.startsWith('SELECT state,net_cents'))return {rows:[{state:'blocked',net_cents:0}]};
  return {rows:[]};
 }};
 let orders=0;
 const result=await runAutomaticProcurement({id:'buyer',role:'restaurant'},{db,now:new Date('2026-10-16T12:00:00Z'),clock:()=>new Date('2026-10-16T12:00:00Z'),
  draft:async()=>({complete:true,lines:[{stockId:'stock',productId:'product',packs:1}]}),
  cart:async(_db,_user,_body,options)=>{
   if(options.checkout===false)return {canOrder:true,quote:{netCents:100,groups:[]}};
   await options.authorize(db,{netCents:100,groups:[]});orders++;
  }});
 assert.equal(result.state,'blocked');assert.match(result.error,/Lieferantenangebot/);assert.equal(orders,0);
});

test('automatic procurement refuses concurrent restaurant run before creating a daily order',async()=>{
 const policy={enabled:true,days:2,leadDays:1,supplierIds:['supplier']};
 let inserts=0,released=0,unlocks=0;
 const db={
  query:async sql=>{
   if(sql.startsWith('SELECT * FROM ai_auto_procurement '))return {rows:[{policy,version:1}]};
   if(sql.startsWith('INSERT INTO ai_auto_procurement_runs'))inserts++;
   return {rows:[]};
  },
  connect:async()=>({
   query:async sql=>{
    if(sql.includes('pg_try_advisory_lock'))return {rows:[{locked:false}]};
    if(sql.includes('pg_advisory_unlock')){unlocks++;return {rows:[{pg_advisory_unlock:false}]}};
    throw Error('Unexpected lock query');
   },
   release:()=>{released++}
  })
 };
 const result=await runAutomaticProcurement({id:'restaurant-1',role:'restaurant'},{db});
 assert.deepEqual(result,{state:'busy'});
 assert.equal(inserts,0);
 assert.equal(unlocks,0);
 assert.equal(released,1);
});

test('automatic procurement namespaces locks by restaurant account',async()=>{
 const keys=[];
 const policy={enabled:true,days:2,leadDays:1,supplierIds:['supplier']};
 const db={
  query:async sql=>{
   if(sql.startsWith('SELECT * FROM ai_auto_procurement '))return {rows:[{policy,version:1}]};
   if(sql.startsWith('INSERT INTO ai_auto_procurement_runs'))return {rows:[{id:'daily',state:'ordered',net_cents:100}]};
   return {rows:[]};
  },
  connect:async()=>({query:async(sql,args)=>{if(sql.includes('pg_try_advisory_lock')||sql.includes('pg_advisory_unlock')){keys.push({sql,args});return {rows:[{locked:true,unlocked:true}]};}return db.query(sql,args);},release:()=>{}})
 };
 await runAutomaticProcurement({id:'restaurant-a'},{db});
 await runAutomaticProcurement({id:'restaurant-b'},{db});
 const locks=keys.filter(x=>x.sql.includes('pg_try_advisory_lock'));
 const unlocks=keys.filter(x=>x.sql.includes('pg_advisory_unlock'));
 assert.equal(locks.length,2);
 assert.deepEqual(locks.map(x=>x.args),[['bringness-ai-auto-procurement','restaurant-a'],['bringness-ai-auto-procurement','restaurant-b']]);
 assert.deepEqual(unlocks.map(x=>x.args),locks.map(x=>x.args));
});

test('automatic procurement releases the same advisory-lock connection after a no-need run',async()=>{
 const policy={enabled:true,days:2,leadDays:1,supplierIds:['supplier']};
 let locks=0,unlocks=0,releases=0;
 const connection={
  query:async sql=>{
   if(sql.includes('pg_try_advisory_lock')){locks++;return {rows:[{locked:true}]}};
   if(sql.includes('pg_advisory_unlock')){unlocks++;return {rows:[{pg_advisory_unlock:true}]}};
   return db.query(sql);
  },
  release:()=>{releases++}
 };
 const db={
  connect:async()=>connection,
  query:async sql=>{
   if(sql.startsWith('SELECT * FROM ai_auto_procurement '))return {rows:[{policy,version:1}]};
   if(sql.startsWith('INSERT INTO ai_auto_procurement_runs'))return {rows:[{id:'daily',state:'pending'}]};
   if(sql.startsWith('SELECT state,net_cents'))return {rows:[{state:'no_need',net_cents:0}]};
   return {rows:[]};
  }
 };
 const result=await runAutomaticProcurement({id:'restaurant-1',role:'restaurant'},{db,draft:async()=>({complete:true,lines:[]})});
 assert.equal(result.state,'no_need');
 assert.equal(locks,1);
 assert.equal(unlocks,1);
 assert.equal(releases,1);
});

test('automatic procurement never exposes internal errors in run history or API results',async()=>{
 const policy={enabled:true,days:2,leadDays:1,supplierIds:['supplier']};
 let storedError;
 const db={query:async(sql,args)=>{
  if(sql.startsWith('SELECT * FROM ai_auto_procurement '))return {rows:[{policy,version:1}]};
  if(sql.startsWith('INSERT INTO ai_auto_procurement_runs'))return {rows:[{id:'daily',state:'pending'}]};
  if(sql.includes("state='blocked'")){storedError=args[1];return {rows:[]}};
  if(sql.startsWith('SELECT state,net_cents'))return {rows:[{state:'blocked',net_cents:0}]};
  return {rows:[]};
 }};
 const result=await runAutomaticProcurement({id:'restaurant-a'},{db,draft:async()=>{throw Error('postgresql password=SECRET host=internal') }});
 assert.equal(result.state,'blocked');
 assert.equal(result.error,'Automatische Beschaffung vorübergehend nicht möglich');
 assert.equal(storedError,result.error);
});

test('automatic checkout rejects zero-net supplier orders before creating an order',async()=>{
 const policy={enabled:true,days:2,leadDays:1,maxDailyNetCents:10000,supplierIds:['supplier'],supplierTerms:{supplier:['Berlin','terms',0]}};
 const db={query:async sql=>{
  if(sql.startsWith('SELECT * FROM ai_auto_procurement '))return {rows:[{policy,version:1}]};
  if(sql.startsWith('INSERT INTO ai_auto_procurement_runs'))return {rows:[{id:'daily',state:'pending'}]};
  if(sql.startsWith('SELECT state,net_cents'))return {rows:[{state:'blocked',net_cents:0}]};
  return {rows:[]};
 }};
 let created=0;
 const quote={netCents:0,groups:[{supplierId:'supplier',deliveryArea:'Berlin',terms:'terms',minimumCents:0}]};
 const result=await runAutomaticProcurement({id:'buyer',role:'restaurant'},{db,
  now:new Date('2026-10-16T12:00:00Z'),clock:()=>new Date('2026-10-16T12:00:00Z'),
  draft:async()=>({complete:true,lines:[{stockId:'stock',productId:'product',packs:1}]}),
  cart:async(_db,_user,_body,options)=>{
   if(options.checkout===false)return {canOrder:true,quote};
   await options.authorize(db,quote);
   created++;
  }
 });
 assert.equal(result.state,'blocked');
 assert.match(result.error,/Warenwertgrenze/);
 assert.equal(created,0);
});

test('disabling automatic procurement ignores stale supplier fields and increments the policy version',async()=>{
 const queries=[];
 const db={connect:async()=>({query:async(sql,args)=>{
  queries.push({sql,args});
  if(sql.startsWith('SELECT id FROM ai_accounts'))return {rowCount:1,rows:[{id:'restaurant'}]};
  if(sql.startsWith('UPDATE ai_auto_procurement'))return {rowCount:1,rows:[{account_id:'restaurant'}]};
  return {rowCount:1,rows:[]};
 },release:()=>{}})};
 assert.deepEqual(await saveProcurementPolicy(db,{id:'restaurant',role:'restaurant'},{
  enabled:false,supplierIds:[],days:0,leadDays:0,maxDailyNetCents:0
 }),{ok:true});
 assert.equal(queries.some(q=>q.sql.includes("policy=jsonb_set")),true);
 assert.equal(queries.some(q=>q.sql.includes('minimum_order_cents')),false);
 assert.equal(queries.at(-1).sql,'COMMIT');
});

test('automatic procurement discards pooled connection if advisory unlock fails',async()=>{
 let discarded;
 const policy={enabled:true};
 const db={
  query:async sql=>{
   if(sql.startsWith('SELECT * FROM ai_auto_procurement '))return {rows:[{policy,version:1}]};
   if(sql.startsWith('INSERT INTO ai_auto_procurement_runs'))return {rows:[{id:'daily',state:'ordered',net_cents:123}]};
   return {rows:[]};
  },
  connect:async()=>({
   query:async sql=>{
    if(sql.includes('pg_try_advisory_lock'))return {rows:[{locked:true}]};
    if(sql.includes('pg_advisory_unlock'))throw Error('connection lost');
    return db.query(sql);
   },
   release:error=>{discarded=error}
  })
 };
 const result=await runAutomaticProcurement({id:'restaurant-a'},{db});
 assert.equal(result.state,'ordered');
 assert.match(discarded.message,/connection lost/);
});

test('a one-connection pool can plan, transact and acknowledge without a second checkout lease',async()=>{
 const policy={enabled:true,days:2,leadDays:1,maxDailyNetCents:10000,supplierIds:['supplier'],supplierTerms:{supplier:['Berlin','terms',0]}};
 let leased=false,releases=0,acquisitions=0,ordered=false,transactions=0;
 const query=async sql=>{
  if(sql.startsWith('SELECT * FROM ai_auto_procurement '))return {rows:[{policy,version:1}]};
  if(sql.startsWith('INSERT INTO ai_auto_procurement_runs'))return {rows:[{id:'run',state:'pending'}]};
  if(sql.startsWith('SELECT state'))return {rows:[{state:ordered?'ordered':'pending',net_cents:100}]};
  if(sql.includes("state='ordered'"))ordered=true;
  if(sql==='BEGIN')transactions++;
  if(sql.includes('pg_try_advisory_lock'))return {rows:[{locked:true}]};
  if(sql.includes('pg_advisory_unlock'))return {rows:[{unlocked:true}]};
  return {rows:[]};
 };
 const db={query:async(...args)=>{assert.equal(leased,false,'pool query would wait for the only leased connection');return query(...args);},connect:async()=>{
  assert.equal(leased,false,'second lease would exhaust the pool');leased=true;acquisitions++;
  return {query,release(){assert.equal(ordered,true);leased=false;releases++;}};
 }};
 const lines=[{stockId:'stock',productId:'product',packs:1}],quote={netCents:100,groups:[{supplierId:'supplier',deliveryArea:'Berlin',terms:'terms',minimumCents:0}]};
 const result=await runAutomaticProcurement({id:'buyer',role:'restaurant'},{db,
  draft:async(_u,_b,{db:scoped})=>{await scoped.query('SELECT 1');return {complete:true,lines};},
  cart:async(scoped,_u,_b,options)=>{
   const borrowed=await scoped.connect();await borrowed.query('BEGIN');
   if(options.checkout===false){await borrowed.query('COMMIT');borrowed.release();return {canOrder:true,quote};}
   await options.authorize(borrowed,quote);await options.onCreated(borrowed,{quote,orders:[{id:'order'}]});
   await borrowed.query('COMMIT');borrowed.release();return {orders:[{id:'order'}]};
  }});
 assert.equal(result.state,'ordered');assert.equal(acquisitions,1);assert.equal(releases,1);assert.equal(transactions,2);assert.equal(leased,false);
});
