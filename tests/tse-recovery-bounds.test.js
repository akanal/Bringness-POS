import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectTseRecovery} from '../server/tse-signing-worker.js';

test('recovery inspection clamps excessive limits',async()=>{
 let limit;
 const pool={query:async(sql,params)=>{assert.match(sql,/^SELECT /);limit=params[0];return {rows:[]}}};
 await inspectTseRecovery(pool,{limit:100000});
 assert.equal(limit,500);
});
test('recovery inspection never requests zero or negative rows',async()=>{
 const limits=[];
 const pool={query:async(_sql,params)=>{limits.push(params[0]);return {rows:[]}}};
 await inspectTseRecovery(pool,{limit:-50});
 await inspectTseRecovery(pool,{limit:0});
 assert.deepEqual(limits,[1,100]);
});
