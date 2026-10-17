import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {createSecretDeriver,legacyPasswordHash,saltedSecretHash,secretMatches} from './secret-derivation.js';
test('async credentials remain byte-compatible with current POS hashes and salted AI/PIN hashes',async()=>{
 const password='Küche🌻Ab1!',legacy=crypto.scryptSync(password,process.env.PASSWORD_PEPPER||'bringness-pos',64).toString('hex');
 assert.equal(await legacyPasswordHash(password),legacy);assert.equal(await secretMatches(password,legacy),true);
 const stored=await saltedSecretHash(password),[salt,key]=stored.split(':');assert.equal(key,crypto.scryptSync(password,salt,64).toString('hex'));
 assert.equal(await secretMatches(password,stored),true);assert.equal(await secretMatches('wrong',stored),false);assert.equal(await secretMatches(password,legacy,{allowLegacy:false}),false);
 for(const bad of ['',null,'bad:hash',':'+key,'x'.repeat(100000)])assert.equal(await secretMatches(password,bad),false);
});
test('derivation work and queue are bounded and capacity recovers after success or failure',async()=>{
 const jobs=[];const derive=createSecretDeriver({maxActive:1,maxQueued:1,derive:(v,s,n,done)=>jobs.push({v,s,n,done})});
 const a=derive('first','salt'),b=derive('second','salt');await assert.rejects(derive('third','salt'),e=>e.status===503&&e.code==='AUTH_CAPACITY');assert.equal(jobs.length,1);
 const error=assert.rejects(a,/fixture/);jobs[0].done(Error('fixture'));await error;assert.equal(jobs.length,2);jobs[1].done(null,Buffer.alloc(64,2));assert.equal((await b)[0],2);
 const c=derive('third','salt');jobs[2].done(null,Buffer.alloc(64,3));assert.equal((await c)[0],3);
});
test('credential derivation yields to the event loop and validates input before allocating work',async()=>{
 let timerRan=false;const pending=legacyPasswordHash('Ab1!xy');await new Promise(resolve=>setTimeout(()=>{timerRan=true;resolve();},0));await pending;assert(timerRan);
 const derive=createSecretDeriver({derive:()=>assert.fail('invalid input reached KDF')});await assert.rejects(derive({},'salt'),e=>e.status===400);await assert.rejects(derive('a',''),e=>e.status===400);
});
