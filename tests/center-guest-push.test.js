import test from 'node:test';
import assert from 'node:assert/strict';
import {centerPushConfiguration,validateGuestSubscription,saveGuestSubscription,manageGuestSubscription} from '../server/center-guest-push.js';

const subscription={
 endpoint:'https://fcm.googleapis.com/fcm/send/test',
 keys:{p256dh:Buffer.alloc(65,1).toString('base64url'),auth:Buffer.alloc(16,2).toString('base64url')}
};
const token='a'.repeat(64);
test('center push stays disabled without explicit opt-in and credentials',()=>{
 assert.equal(centerPushConfiguration({CENTER_PUSH_ENABLED:'false',VAPID_PUBLIC_KEY:'a',VAPID_PRIVATE_KEY:'b'}),null);
 assert.equal(centerPushConfiguration({CENTER_PUSH_ENABLED:'true',VAPID_PUBLIC_KEY:'a'}),null);
 assert.deepEqual(centerPushConfiguration({CENTER_PUSH_ENABLED:'true',VAPID_PUBLIC_KEY:'a',VAPID_PRIVATE_KEY:'b'}),{publicKey:'a'});
});
test('center push accepts a valid provider endpoint and correctly sized keys',()=>{
 assert.deepEqual(validateGuestSubscription(subscription),subscription);
});
test('center push rejects unsafe endpoints',()=>{
 for(const endpoint of ['http://fcm.googleapis.com/send','https://example.com/send','https://fcm.googleapis.com:444/send','https://user:pass@fcm.googleapis.com/send']){
  assert.throws(()=>validateGuestSubscription({...subscription,endpoint}),/INVALID_PUSH_ENDPOINT/);
 }
});
test('center push rejects invalid encryption keys',()=>{
 assert.throws(()=>validateGuestSubscription({...subscription,keys:{...subscription.keys,auth:'bad'}}),/INVALID_PUSH_KEY/);
 assert.throws(()=>validateGuestSubscription({...subscription,keys:{...subscription.keys,p256dh:'invalid!'}}),/INVALID_PUSH_KEY/);
});
test('center push never stores a subscription without explicit consent',async()=>{
 let called=false;
 const pool={query:async()=>{called=true;return {rows:[]}}};
 await assert.rejects(()=>saveGuestSubscription(pool,token,subscription,false),/INVALID_PUSH_CONSENT/);
 await assert.rejects(()=>saveGuestSubscription(pool,'invalid',subscription,true),/INVALID_PUSH_CONSENT/);
 assert.equal(called,false);
});
test('center push rejects unknown subscription-management actions before database access',async()=>{
 let called=false;
 const pool={query:async()=>{called=true;return {rows:[]}}};
 await assert.rejects(()=>manageGuestSubscription(pool,token,subscription,'enable'),/INVALID_PUSH_ACTION/);
 assert.equal(called,false);
});

test('center push returns consistent error for missing and malformed endpoints',()=>{
 for(const endpoint of ['', 'not-a-url', 'https://[invalid']){
  assert.throws(()=>validateGuestSubscription({...subscription,endpoint}),/INVALID_PUSH_ENDPOINT/);
 }
});
