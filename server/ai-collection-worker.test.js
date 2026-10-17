import test from 'node:test';
import assert from 'node:assert/strict';
import {collectionTick} from './ai-collection.js';
import {issueInvoice} from './ai-invoices.js';
test('disabled collection prepares existing bookkeeping on its single leased connection without provider actions',async()=>{
 let leases=0,releases=0;const queries=[];
 const client={query:async sql=>{
  queries.push(sql);
  if(sql.includes('pg_try_advisory_lock'))return {rows:[{locked:true}]};
  if(sql.includes('pg_advisory_unlock'))return {rows:[{unlocked:true}]};
  if(sql.includes("key='collection'"))return {rows:[{value:{enabled:false,monthlyEnabled:false}}]};
  return {rows:[]};
 },release(error){assert.equal(error,undefined);releases++;}};
 await collectionTick({db:{connect:async()=>{leases++;return client;},query:async()=>assert.fail('must not lease a second connection')},sendNotice:async()=>assert.fail('disabled billing must not send mail')});
 assert.equal(leases,1);assert.equal(releases,1);
 assert(queries.some(sql=>sql.startsWith('INSERT INTO ai_collection_jobs')));assert(queries.some(sql=>sql.includes("state='awaiting_setup'")));
 assert.equal(queries.filter(sql=>sql.includes('pg_advisory_unlock')).length,1);
});
test('collection skips competing worker and discards sessions whose lock release is uncertain',async()=>{
 for(const mode of ['busy','false','throw']){
  let unlocks=0,released;
  const client={query:async sql=>{
   if(sql.includes('pg_try_advisory_lock'))return {rows:[{locked:mode!=='busy'}]};
   if(sql.includes('pg_advisory_unlock')){unlocks++;if(mode==='throw')throw Error('lost connection');return {rows:[{unlocked:false}]};}
   if(sql.includes("key='collection'"))return {rows:[{value:{enabled:false}}]};
   return {rows:[]};
  },release:error=>{released={error};}};
  await collectionTick({db:{connect:async()=>client}});assert.equal(unlocks,mode==='busy'?0:1);assert.equal(Boolean(released.error),mode!=='busy');
 }
});

test('invoice issuer validation runs before requesting a database connection',async()=>{
 let connections=0;await assert.rejects(issueInvoice({}, {issuer:{}},null,{db:{connect:async()=>{connections++;throw Error('unexpected database access');}}}),/Rechnungssteller/);assert.equal(connections,0);
});
