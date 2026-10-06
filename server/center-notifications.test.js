import test from 'node:test';
import assert from 'node:assert/strict';
import {enqueueCenterReadyNotification} from './center-notifications.js';
test('ready notification intent requires confirmed kitchen release and ready state',async()=>{
 const result=await enqueueCenterReadyNotification({query:async(sql,args)=>{
 assert.match(sql,/o.status='ready'/);assert.match(sql,/cp.released_at IS NOT NULL AND cp.ready_at IS NOT NULL/);
 assert.match(sql,/ON CONFLICT\(order_id,event_type\) DO NOTHING/);
 assert.deepEqual(args,['order']);return {rows:[{id:'notification'}]};
 }},'order');assert.equal(result.id,'notification');
});
test('repeated readiness produces no second notification intent',async()=>{
 const result=await enqueueCenterReadyNotification({query:async()=>({rows:[]})},'order');assert.equal(result,null);
});
test('notification persistence failure propagates to the kitchen transaction',async()=>{
 await assert.rejects(enqueueCenterReadyNotification({query:async()=>{throw Error('database unavailable');}},'order'),/database unavailable/);
});
