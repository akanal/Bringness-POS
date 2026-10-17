import test from 'node:test';
import assert from 'node:assert/strict';
import {monitorTick,refreshMonitor} from './ai-inventory.js';
test('monitor lends its existing connection to account transactions and isolates failed accounts',async()=>{
 let leases=0,released=0,unlocks=0;const visited=[],recorded=[];
 const client={query:async(sql,args)=>{
  if(sql.includes('pg_try_advisory_lock'))return {rows:[{locked:true}]};
  if(sql.includes('pg_advisory_unlock')){unlocks++;return {rows:[{unlocked:true}]};}
  if(sql.startsWith('SELECT a.id FROM ai_accounts'))return {rows:[{id:'broken'},{id:'healthy'}]};
  if(sql.startsWith('INSERT INTO ai_monitor_state'))recorded.push(args[0]);
  return {rows:[]};
 },release(error){assert.equal(error,undefined);released++;}};
 await monitorTick({db:{connect:async()=>{leases++;return client;}},refresh:async(id,options)=>{
  assert.equal(options.client,client);visited.push(id);if(id==='broken')throw Error('private database details');
  await options.client.query('BEGIN');await options.client.query('COMMIT');
 }});
 assert.deepEqual(visited,['broken','healthy']);assert.deepEqual(recorded,['broken']);assert.equal(leases,1);assert.equal(released,1);assert.equal(unlocks,1);
});
test('refreshMonitor never releases a borrowed client and rolls back inactive accounts',async()=>{
 const queries=[];let releases=0;
 const client={query:async sql=>{queries.push(sql);return {rows:[]};},release(){releases++;}};
 await refreshMonitor('inactive',{client});assert.equal(queries.at(-1),'ROLLBACK');assert.equal(releases,0);
 await refreshMonitor('inactive',{db:{connect:async()=>client}});assert.equal(releases,1);
});
test('monitor does not unlock a competing session and discards connections after an uncertain unlock',async()=>{
 for(const mode of ['busy','false','throw']){
  let unlocks=0,released;
  const client={query:async sql=>{
   if(sql.includes('pg_try_advisory_lock'))return {rows:[{locked:mode!=='busy'}]};
   if(sql.includes('pg_advisory_unlock')){unlocks++;if(mode==='throw')throw Error('connection lost');return {rows:[{unlocked:false}]};}
   return {rows:[]};
  },release:error=>{released={error};}};
  await monitorTick({db:{connect:async()=>client}});assert.equal(unlocks,mode==='busy'?0:1);
  assert.equal(Boolean(released.error),mode!=='busy');
 }
});
