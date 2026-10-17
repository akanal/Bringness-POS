import test from 'node:test';
import assert from 'node:assert/strict';
import {BoundedLoginAttempts} from './auth-attempts.js';
test('random login identities cannot grow the limiter or evict an active account block',()=>{
 let now=10;const map=new BoundedLoginAttempts({maxEntries:2,now:()=>now});map.set('blocked',{until:100,blockedUntil:90});map.set('other',{until:50});
 assert.throws(()=>map.set('attacker',{until:100}),e=>e.status===429&&e.code==='AUTH_RATE_CAPACITY');assert.equal(map.size,2);assert.equal(map.get('blocked').blockedUntil,90);
 now=60;map.set('new',{until:200});assert.equal(map.size,2);assert.equal(map.has('other'),false);assert(map.has('blocked'));map.set('blocked',{until:300});assert.equal(map.size,2);
});
