import test from 'node:test';
import assert from 'node:assert/strict';
import {createOfflineSync} from './offline-sync.mjs';

function fixture(ids,{reply,failAck}={}){
 const pending=new Map(ids.map(id=>[id,{id,request:{id,snapshotId:'catalog-id'}}]));
 const calls=[],errors=[];
 const ledger={
  pendingCount:async()=>pending.size,
  pending:async(excluded=[])=>[...pending.values()].filter(s=>!excluded.includes(s.id)).slice(0,100),
  acknowledge:async(id,receipt)=>{if(failAck===id)throw Error('disk unavailable');assert.equal(receipt.id,'cloud-'+id);pending.delete(id);},
  error:async(id,message)=>{errors.push([id,message]);},
  catalog:async()=>{}
 };
 const connect=async()=>async(type,payload)=>{
  if(type==='catalog')return {snapshot:{id:'catalog-id',validUntil:new Date(Date.now()+60000).toISOString()}};
  calls.push(payload.sales.map(s=>s.id));
  return reply?reply(payload.sales):{results:payload.sales.map(s=>({offlineId:s.id,ok:true,id:'cloud-'+s.id,receiptNumber:'R-'+s.id}))};
 };
 return {ledger,connect,pending,calls,errors};
}

test('drains more than 100 sales without resending a sale in the same run',async()=>{
 const f=fixture(Array.from({length:125},(_,i)=>'sale-'+i));
 const status=await createOfflineSync(f).sync();
 assert.equal(status.state,'success');
 assert.equal(f.pending.size,0);
 assert.equal(f.calls.flat().length,125);
 assert.equal(new Set(f.calls.flat()).size,125);
 assert.ok(f.calls.every(batch=>batch.length<=20));
});

test('a rejected sale remains pending and is not resent during the same run',async()=>{
 const f=fixture(['a','b','c'],{reply:sales=>({results:sales.map(s=>s.id==='a'?{offlineId:s.id,ok:false,error:'rejected'}:{offlineId:s.id,ok:true,id:'cloud-'+s.id,receiptNumber:'R-'+s.id})})});
 const status=await createOfflineSync(f).sync();
 assert.equal(status.state,'warning');
 assert.deepEqual([...f.pending.keys()],['a']);
 assert.equal(f.calls.flat().filter(id=>id==='a').length,1);
 assert.equal(f.errors.length,1);
});

test('failed local acknowledgement leaves sale queued for a later run',async()=>{
 const f=fixture(['a','b'],{failAck:'a'});
 const status=await createOfflineSync(f).sync();
 assert.equal(status.state,'warning');
 assert.deepEqual([...f.pending.keys()],['a']);
 assert.equal(f.calls.flat().filter(id=>id==='a').length,1);
});

test('ambiguous server IDs never acknowledge sales',async()=>{
 const f=fixture(['a','b'],{reply:()=>({results:[{offlineId:'a',ok:true,id:'cloud-a',receiptNumber:'R-a'},{offlineId:'a',ok:true,id:'cloud-a',receiptNumber:'R-a'}]})});
 const status=await createOfflineSync(f).sync();
 assert.equal(status.state,'error');
 assert.equal(f.pending.size,2);
});

test('lost server response preserves pending sales',async()=>{
 const f=fixture(['a'],{reply:()=>{throw Error('connection lost')}});
 const status=await createOfflineSync(f).sync();
 assert.equal(status.state,'error');
 assert.equal(f.pending.size,1);
});

test('concurrent synchronization requests share one in-flight operation',async()=>{
 const f=fixture(['a']);let release;const gate=new Promise(resolve=>{release=resolve});let connects=0;
 const sync=createOfflineSync({...f,connect:async()=>{connects++;await gate;return f.connect()}});
 const first=sync.sync(),second=sync.sync(true);
 assert.equal(first,second);release();await first;
 assert.equal(connects,1);
 assert.equal(f.pending.size,0);
});

test('missing login preserves all pending sales',async()=>{
 const f=fixture(['a']);
 const status=await createOfflineSync({...f,connect:async()=>null}).sync();
 assert.equal(status.state,'login');
 assert.equal(f.pending.size,1);
});

test('invalid success receipt remains pending for review',async()=>{
 const f=fixture(['a'],{reply:()=>({results:[{offlineId:'a',ok:true,id:'cloud-a'}]})});
 const status=await createOfflineSync(f).sync();
 assert.equal(status.state,'warning');
 assert.equal(f.pending.size,1);
 assert.equal(f.errors.length,1);
});

test('out-of-order valid acknowledgements match by offline ID',async()=>{
 const f=fixture(['a','b'],{reply:sales=>({results:sales.map(s=>({offlineId:s.id,ok:true,id:'cloud-'+s.id,receiptNumber:'R-'+s.id})).reverse()})});
 const status=await createOfflineSync(f).sync();
 assert.equal(status.state,'success');
 assert.equal(f.pending.size,0);
});

test('unknown server acknowledgement ID leaves the entire batch pending',async()=>{
 const f=fixture(['a'],{reply:()=>({results:[{offlineId:'foreign',ok:true,id:'cloud-a',receiptNumber:'R-a'}]})});
 const status=await createOfflineSync(f).sync();
 assert.equal(status.state,'error');
 assert.equal(f.pending.size,1);
});

test('rejected early sale does not block later pages of the queue',async()=>{
 const ids=Array.from({length:140},(_,i)=>'sale-'+i);
 const f=fixture(ids,{reply:sales=>({results:sales.map(s=>s.id==='sale-0'?{offlineId:s.id,ok:false,error:'review'}:{offlineId:s.id,ok:true,id:'cloud-'+s.id,receiptNumber:'R-'+s.id})})});
 const status=await createOfflineSync(f).sync();
 assert.equal(status.state,'warning');
 assert.deepEqual([...f.pending.keys()],['sale-0']);
 assert.equal(f.calls.flat().length,140);
 assert.equal(new Set(f.calls.flat()).size,140);
});

test('catalog refresh failure never reports overall success',async()=>{
 const f=fixture([]);
 f.ledger.catalog=async()=>{throw Error('catalog storage failure')};
 const status=await createOfflineSync(f).sync();
 assert.equal(status.state,'warning');
 assert.match(status.message,/Katalogaktualisierung fehlgeschlagen/);
});

test('cloud receipt reused for another sale cannot acknowledge that sale',async()=>{
 const f=fixture(['a','b'],{reply:()=>({results:[
  {offlineId:'a',ok:true,id:'cloud-a',receiptNumber:'R-a'},
  {offlineId:'b',ok:true,id:'cloud-a',receiptNumber:'R-b'}
 ]})});
 const status=await createOfflineSync(f).sync();
 assert.equal(status.state,'warning');
 assert.deepEqual([...f.pending.keys()],['b']);
 assert.equal(f.errors.length,1);
});

test('duplicate offline IDs in a single page are never transmitted',async()=>{
 const f=fixture(['a']);
 f.ledger.pending=async()=>[
  {id:'a',request:{id:'a',snapshotId:'catalog-id'}},
  {id:'a',request:{id:'a',snapshotId:'catalog-id'}}
 ];
 const status=await createOfflineSync(f).sync();
 assert.equal(status.state,'error');
 assert.equal(f.calls.length,0);
 assert.equal(f.pending.size,1);
});
