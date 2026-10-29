import test from 'node:test';
import assert from 'node:assert/strict';
import {startMarketplaceReconciliation} from './shop-payment-reconciliation-scheduler.js';
function clock(){let next=0;const timers=new Map();return {timers,setTimer(fn,ms){timers.set(++next,{fn,ms});return next;},clearTimer(id){timers.delete(id);}};}
test('scheduler is explicit, nonoverlapping, waits after work and drains on stop',async()=>{
 const c=clock();let calls=0,release;const seen=[];
 const scheduler=startMarketplaceReconciliation({...c,reconcile:async({limit})=>{calls++;assert.equal(limit,5);await new Promise(r=>{release=r;});return {checked:1,failed:0};},onResult:r=>seen.push(r)});
 assert.equal(calls,0);assert.equal(c.timers.size,1);
 const first=scheduler.tick(),second=scheduler.tick();assert.equal(first,second);assert.equal(calls,1);assert.equal(c.timers.size,0);
 let stopped=false;const stop=scheduler.stop().then(()=>{stopped=true;});await Promise.resolve();assert.equal(stopped,false);release();await stop;
 assert.equal(c.timers.size,0);assert.deepEqual(seen,[{ok:true,checked:1,failed:0,busy:false}]);assert.deepEqual(await scheduler.tick(),{stopped:true});assert.equal(calls,1);
});
test('worker errors and observer failures neither leak secrets nor stop scheduling',async()=>{
 const c=clock();const scheduler=startMarketplaceReconciliation({...c,reconcile:async()=>{throw Error('secret');},onResult:async()=>{throw Error('observer');}});
 assert.deepEqual(await scheduler.tick(),{ok:false,code:'MARKET_RECONCILIATION_UNAVAILABLE'});assert.equal(c.timers.size,1);await scheduler.stop();assert.equal(c.timers.size,0);
});
test('scheduler rejects unsafe cadence and unbounded batches',()=>{
 for(const options of [{intervalMs:1},{intervalMs:Infinity},{limit:50},{limit:0},{reconcile:null}])assert.throws(()=>startMarketplaceReconciliation({reconcile:async()=>{},...options}),/INVALID_MARKET_SCHEDULER/);
});
