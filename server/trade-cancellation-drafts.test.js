import {test} from 'node:test';
import assert from 'node:assert/strict';
import {draftRequest,saveCancellationDraft,getCancellationDraft} from './trade-cancellation-drafts.js';
const id='11111111-1111-4111-8111-111111111111',user={id,company_id:id,role:'owner'},body={requestKey:id,reason:'Falscher Empfänger'};
test('draft reason is bounded, normalized and cannot carry controls or malformed request identity',()=>{
 assert.deepEqual(draftRequest({...body,reason:'  Grund  '}),{requestKey:id,reason:'Grund'});
 for(const value of [null,{},[],{...body,reason:7},{...body,reason:'xx'},{...body,reason:'x'.repeat(501)},{...body,reason:'Grund\nZeile'},{...body,reason:'Grund\0Zeile'},{...body,requestKey:'not-uuid'}])assert.throws(()=>draftRequest(value),e=>e.status===400);
});
test('revoked role is rejected before reading or writing any draft and transaction is released',async()=>{
 for(const actor of [null,{...user,role:'manager'},{...user,id:'other'},{...user,company_id:'other'}]){
  const calls=[];let released=false;const pool={connect:async()=>({query:async sql=>{calls.push(sql);return {rows:[]}},release(){released=true}})};
  await assert.rejects(saveCancellationDraft(pool,async()=>actor,{headers:{}},user,id,body),e=>e.status===403);
  assert.deepEqual(calls,['BEGIN','ROLLBACK']);assert(released);
 }
});
test('missing or invalid PIN never reads invoice data or creates a draft',async()=>{
 for(const headers of [{},{authorization:'Bearer fixture','x-personnel-unlock':'wrong'}]){
  const calls=[];const pool={connect:async()=>({query:async sql=>{calls.push(sql);return {rows:[]}},release(){}})};
  await assert.rejects(saveCancellationDraft(pool,async()=>user,{headers},user,id,body),e=>e.status===403);
  assert(!calls.some(sql=>/INSERT|pos_trade_cancellation_drafts|FROM receipts/.test(sql)));
 }
});
test('lookup scopes original invoice before exposing stored draft data',async()=>{
 const calls=[];const pool={query:async(sql,args)=>{calls.push(sql);assert.deepEqual(args,[id,id]);return {rows:[]}}};
 await assert.rejects(getCancellationDraft(pool,user,id),e=>e.status===404);assert.equal(calls.length,1);assert.match(calls[0],/r.company_id=\$2/);
});
