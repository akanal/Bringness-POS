import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import crypto from 'node:crypto';
const source=(await readFile(new URL('./index.js',import.meta.url),'utf8')).split('\n').find(line=>line.startsWith('if(p==="/api/v1/auth/login"'));
const run=new (Object.getPrototypeOf(async function(){}).constructor)('p','req','res','body','pool','hash','json','session','loginAttempts','crypto',source);
test('parallel login attempts per account are bounded and release capacity after success',async()=>{
 const attempts=new Map(),jobs=[];let queries=0;
 const login=async()=>{let reply;await run('/api/v1/auth/login',{method:'POST'},{setHeader(){}},async()=>({email:'owner@example.test',password:'valid'}),{query:async()=>{queries++;return {rows:[{id:'owner',role:'owner'}]};}},()=>new Promise(resolve=>jobs.push(resolve)),(_,status,data)=>{reply={status,...data};},async()=>'session',attempts,crypto);return reply;};
 const first=login(),second=login();await new Promise(resolve=>setImmediate(resolve));assert.equal(jobs.length,2);
 const blocked=await login();assert.equal(blocked.status,429);assert.equal(blocked.retryAfter,1);assert.equal(queries,0);
 jobs.forEach(resolve=>resolve('hash'));assert.equal((await first).status,200);assert.equal((await second).status,200);assert.equal(attempts.size,0);
});
test('temporary hashing failures do not consume bad-password attempts or leave an in-flight lock',async()=>{
 const attempts=new Map();const args=['/api/v1/auth/login',{method:'POST'},{},async()=>({email:'owner@example.test',password:'valid'}),{query:async()=>assert.fail('database must not run')},async()=>{throw Object.assign(Error('capacity'),{code:'AUTH_CAPACITY'});},()=>{},async()=>'session',attempts,crypto];
 await assert.rejects(run(...args),/capacity/);const entry=[...attempts.values()][0];assert.equal(entry.count,0);assert.equal(entry.inflight,0);
});
