import test from 'node:test';
import assert from 'node:assert/strict';
import {exportCenterTableQr} from './center-table-qr.js';
const center='11111111-1111-4111-8111-111111111111',table='22222222-2222-4222-8222-222222222222',token='a'.repeat(48),user={company_id:'owner-company'};
test('QR export uses the fixed table URL and company-scoped lookup',async()=>{
 const pool={query:async(sql,args)=>{assert.match(sql,/c.company_id=\$3/);assert.match(sql,/t.active=true AND c.active=true/);assert.deepEqual(args,[table,center,user.company_id]);return {rows:[{name:'Tisch',qr_token:token}]};}};
 let encoded;
 const result=await exportCenterTableQr(pool,user,center,table,{PUBLIC_BASE_URL:'https://pos.example.test'},async value=>{encoded=value;return '<svg/>';});
 assert.equal(result.status,200);assert.equal(encoded,'https://pos.example.test/center/index.html?code='+token);assert.equal(result.svg,'<svg/>');assert.equal(result.filename,'center-tisch-'+table+'.svg');
});
test('unowned or inactive tables never render a QR',async()=>{
 const result=await exportCenterTableQr({query:async()=>({rows:[]})},user,center,table,{PUBLIC_BASE_URL:'https://pos.example.test'},()=>{throw Error('must not render');});
 assert.equal(result.status,404);
});
test('invalid IDs do not access the database',async()=>{
 assert.equal((await exportCenterTableQr({query(){throw Error('no query');}},user,'bad',table)).status,404);
});
test('missing, insecure or credential-bearing public origins are rejected',async()=>{
 const pool={query:async()=>({rows:[{qr_token:token}]})};
 for(const origin of ['', 'http://example.test','https://user:secret@example.test','https://example.test/path','https://example.test/?x=1']){
  assert.equal((await exportCenterTableQr(pool,user,center,table,{CENTER_PUBLIC_ORIGIN:origin},()=>{throw Error('must not render');})).status,503);
 }
});
