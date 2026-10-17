import test from 'node:test';
import assert from 'node:assert/strict';
import {issueLoginSession} from './login-session.js';
const userId='11111111-1111-4111-8111-111111111111';
test('session issue rechecks current status, password and role under a conflicting account lock',async()=>{
 for(const account of [null,{status:'disabled',password_hash:'old',role:'owner'},{status:'active',password_hash:'new',role:'owner'},{status:'active',password_hash:'old',role:'waiter'}]){
  const calls=[];let released=0;
  const db={connect:async()=>({query:async(sql,args)=>{calls.push({sql,args});return {rows:sql.startsWith('SELECT')&&account?[account]:[]};},release(){released++;}})};
  assert.equal(await issueLoginSession(db,{userId,passwordHash:'old',role:'owner'}),null);assert.equal(calls.at(-1).sql,'ROLLBACK');assert.equal(calls.some(x=>x.sql.startsWith('INSERT')),false);assert(calls.some(x=>x.sql.includes('FOR SHARE')));assert.equal(released,1);
 }
});
test('POS and AI sessions keep their existing lifetimes and never store the bearer secret',async()=>{
 for(const kind of ['pos','ai']){
  const calls=[];let released=0;
  const db={connect:async()=>({query:async(sql,args)=>{calls.push({sql,args});return {rows:sql.startsWith('SELECT')?[{status:'active',password_hash:'old',role:'owner'}]:[]};},release(){released++;}})};
  const token=await issueLoginSession(db,{kind,userId,passwordHash:'old'});assert.match(token,/^[a-f0-9]{64}$/);
  const insert=calls.find(c=>c.sql.startsWith('INSERT'));assert.equal(insert.args[0].length,64);assert.notEqual(insert.args[0],token);assert(insert.sql.includes(kind==='pos'?"30 days":"12 hours"));assert.equal(calls.at(-1).sql,'COMMIT');assert.equal(released,1);
 }
});
