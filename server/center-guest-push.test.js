import test from 'node:test';
import assert from 'node:assert/strict';
import {centerPushConfiguration,validateGuestSubscription,saveGuestSubscription,dispatchCenterGuestPush,manageGuestSubscription} from './center-guest-push.js';
const subscription={endpoint:'https://fcm.googleapis.com/fcm/send/test',keys:{p256dh:Buffer.alloc(65,1).toString('base64url'),auth:Buffer.alloc(16,2).toString('base64url')}};
test('guest push is off without explicit rollout and keys',()=>{
 assert.equal(centerPushConfiguration({}),null);
 assert.equal(centerPushConfiguration({VAPID_PUBLIC_KEY:'public',VAPID_PRIVATE_KEY:'private'}),null);
 assert.deepEqual(centerPushConfiguration({CENTER_PUSH_ENABLED:'true',VAPID_PUBLIC_KEY:'public',VAPID_PRIVATE_KEY:'private'}),{publicKey:'public'});
});
test('push subscriptions cannot target arbitrary or private network servers',()=>{
 assert.equal(validateGuestSubscription(subscription).endpoint,subscription.endpoint);
 for(const endpoint of ['http://fcm.googleapis.com/test','https://localhost/test','https://127.0.0.1/test','https://fcm.googleapis.com.evil.test/test','https://secret@fcm.googleapis.com/test'])
 assert.throws(()=>validateGuestSubscription({...subscription,endpoint}));
 assert.throws(()=>validateGuestSubscription({...subscription,keys:{p256dh:'bad',auth:'bad'}}));
});
test('subscription requires explicit consent and a valid order capability',async()=>{
 await assert.rejects(saveGuestSubscription({query(){throw Error('must not query');}},'a'.repeat(64),subscription,false));
 let query;
 assert.equal(await saveGuestSubscription({query:async(sql,args)=>{query=sql;assert.equal(args[0],'a'.repeat(64));return {rows:[]};}},'a'.repeat(64),subscription,true),false);
 assert.match(query,/guest_status_token=\$1/);assert.match(query,/24 hours/);
});
test('worker sends restaurant and collection number and marks accepted notification sent',async()=>{
 const sqls=[];let payload;
 const job={id:'notification',order_id:'order',subscription,endpoint_hash:'hash',restaurant_name:'Restaurant',collection_number:'BN-42',guest_status_token:'a'.repeat(64)};
 const count=await dispatchCenterGuestPush({query:async(sql)=>{sqls.push(sql);return {rows:sql.includes('WITH candidates')?[job]:sql.startsWith('SELECT 1')?[{}]:[]};}},async(s,p)=>{assert.deepEqual(s,subscription);payload=JSON.parse(p);});
 assert.equal(count,1);assert.match(payload.body,/BN-42/);assert.match(payload.title,/Restaurant/);assert.equal(payload.tag,'center-ready-order');
 assert.equal(payload.url,'/center/status.html#token='+'a'.repeat(64));
 assert.equal(sqls.some(sql=>sql.includes("state='sent'")),true);
 assert.match(sqls[0],/SKIP LOCKED/);
});
test('expired endpoints are removed and transient failures remain retryable',async()=>{
 for(const statusCode of [410,503]){
  const calls=[];await dispatchCenterGuestPush({query:async(sql,args)=>{calls.push({sql,args});return {rows:sql.includes('WITH candidates')?[{id:'n',order_id:'o',subscription,endpoint_hash:'hash'}]:sql.startsWith('SELECT 1')?[{}]:[]};}},async()=>{throw Object.assign(Error('provider failure'),{statusCode});});
  assert.equal(calls.some(c=>c.sql.startsWith('DELETE FROM center_guest_push WHERE')),statusCode===410);
  const update=calls.find(c=>c.sql.includes("attempts>=5"));assert.equal(update.args[1],statusCode===410);
 }
});

test('disabling requires the order capability and only deletes the matching device',async()=>{
 const calls=[];
 const result=await manageGuestSubscription({query:async(sql,args)=>{calls.push({sql,args});return {rows:sql.startsWith('SELECT o.id')?[{id:'order'}]:[]};}},'a'.repeat(64),subscription,'disable');
 assert.equal(result.subscribed,false);
 assert.match(calls[0].sql,/guest_status_token=\$1/);
 assert.equal(calls[1].args[0],'order');assert.match(calls[1].sql,/endpoint_hash=\$2/);
});
test('an unknown capability cannot remove a subscription',async()=>{
 let n=0;assert.deepEqual(await manageGuestSubscription({query:async()=>{n++;return {rows:[]};}},'a'.repeat(64),subscription,'disable'),{found:false});assert.equal(n,1);
});
test('revoked subscriptions are checked again after the dispatch claim',async()=>{
 let sends=0;
 await dispatchCenterGuestPush({query:async sql=>({rows:sql.includes('WITH candidates')?[{id:'n',order_id:'order',endpoint_hash:'hash',subscription}]:[]})},async()=>{sends++;});
 assert.equal(sends,0);
});

test('new guest consent rearms only failed, never accepted notifications',async()=>{
 let sql;
 const result=await saveGuestSubscription({query:async(text)=>{sql=text;return {rows:[{order_id:'order'}]};}},'a'.repeat(64),subscription,true);
 assert.equal(result,true);
 assert.match(sql,/n.state='failed' AND n.sent_at IS NULL/);
 assert.match(sql,/state='pending',attempts=0,claimed_at=NULL/);
});
