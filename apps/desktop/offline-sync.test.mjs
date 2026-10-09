import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createOfflineSync} from './offline-sync.mjs';
function fixture(count=1){
 const sales=Array.from({length:count},(_,id)=>({id,request:{id}})),accepted=[],errors=[];
 const ledger={pending:async()=>sales.slice(0,100),acknowledge:async(id)=>{accepted.push(id);sales.splice(sales.findIndex(s=>s.id===id),1)},error:async(id,message)=>errors.push({id,message}),catalog:async()=>{}};
 return {ledger,sales,accepted,errors};
}
test('all batches are drained before catalog refresh',async()=>{
 const f=fixture(205),events=[];
 const c=createOfflineSync({ledger:f.ledger,connect:async()=>async(endpoint)=>{events.push(endpoint);return {snapshot:{}}}});
 assert.equal((await c.sync()).state,'success');assert.equal(f.accepted.length,205);assert.equal(events.at(-1),'catalog');assert.equal(f.sales.length,0);
});
test('failed sale stays pending; retry never resends acknowledged sales',async()=>{
 const f=fixture(3);let failing=true;const sent=[];
 const c=createOfflineSync({ledger:f.ledger,connect:async()=>async(endpoint,body)=>{if(endpoint==='sales'){sent.push(body.sale.id);if(failing&&body.sale.id===1)throw Error('Verbindung unterbrochen');}return {snapshot:{}}}});
 assert.equal((await c.sync()).state,'error');assert.deepEqual(f.accepted,[0]);assert.deepEqual(f.sales.map(s=>s.id),[1,2]);assert.equal(f.errors[0].id,1);
 failing=false;assert.equal((await c.sync(true)).state,'success');assert.deepEqual(sent,[0,1,1,2]);
});
test('concurrent manual and automatic runs share one transfer',async()=>{
 const f=fixture();let release;const gate=new Promise(r=>release=r);let connects=0;
 const c=createOfflineSync({ledger:f.ledger,connect:async()=>{connects++;await gate;return async()=>({snapshot:{}})}});
 const a=c.sync(),b=c.sync(true);assert.equal(a,b);release();await a;assert.equal(connects,1);assert.deepEqual(f.accepted,[0]);
});
test('no login preserves sales and reports actionable status',async()=>{
 const f=fixture();const c=createOfflineSync({ledger:f.ledger,connect:async()=>null});
 assert.equal((await c.sync()).state,'login');assert.equal(f.sales.length,1);assert.equal(c.status().lastSuccess,null);
});
test('manual refresh renews catalog even within automatic refresh interval',async()=>{
 const f=fixture(0);let catalogs=0;
 const c=createOfflineSync({ledger:f.ledger,now:()=>1000,connect:async()=>async()=>{catalogs++;return {snapshot:{}}}});
 await c.sync();await c.sync();assert.equal(catalogs,1);await c.sync(true);assert.equal(catalogs,2);
});
test('catalog failure cannot report successful synchronization',async()=>{
 const f=fixture();f.ledger.catalog=async()=>{throw Error('Ursprünglichen Betrieb anmelden')};
 const c=createOfflineSync({ledger:f.ledger,connect:async()=>async()=>({snapshot:{}})});
 const status=await c.sync();assert.equal(status.state,'error');assert.equal(status.lastSuccess,null);assert.equal(f.sales.length,0);
});
