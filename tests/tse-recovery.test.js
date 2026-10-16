import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyTseRecovery} from '../server/tse-recovery.js';
import {inspectTseRecovery} from '../server/tse-signing-worker.js';

const now=new Date('2026-10-16T08:00:00.000Z');
test('signed transactions need no recovery',()=>assert.equal(classifyTseRecovery({state:'signed'},now).action,'none'));
test('prepared transactions remain in normal queue',()=>assert.equal(classifyTseRecovery({state:'prepared'},now).action,'normal_queue'));
test('recent starting transactions are left alone',()=>assert.equal(classifyTseRecovery({state:'starting',updated_at:'2026-10-16T07:59:00Z'},now).action,'wait'));
test('stale finishing transactions require review',()=>assert.equal(classifyTseRecovery({state:'finishing',updated_at:'2026-10-16T07:40:00Z'},now).action,'manual_review'));
test('ambiguous outcomes require review',()=>assert.equal(classifyTseRecovery({state:'needs_review'},now).action,'manual_review'));
test('inspection is read-only',async()=>{
 const queries=[];
 const pool={query:async(sql,params)=>{queries.push({sql,params});return {rows:[{id:'tx-1',restaurant_id:'r-1',receipt_id:'b-1',state:'starting',updated_at:'2026-10-16T07:40:00Z'}]}}};
 const result=await inspectTseRecovery(pool,{now});
 assert.equal(result[0].action,'manual_review');
 assert.equal(queries.length,1);
 assert.match(queries[0].sql,/^SELECT /);
});
