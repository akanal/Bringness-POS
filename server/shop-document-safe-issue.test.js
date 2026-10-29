import test from 'node:test';
import assert from 'node:assert/strict';
import {issueVerifiedArchivedShopDocument} from './shop-document-safe-issue.js';

test('safe entry point rejects missing options',async()=>{
 await assert.rejects(issueVerifiedArchivedShopDocument(null,null),/SHOP_DOCUMENT_OPTIONS_INVALID/);
});
test('safe entry point forces payment and archival safeguards even when caller disables them',async()=>{
 let connected=false;
 const pool={connect:async()=>{connected=true;return {query:async sql=>{
  if(sql==='BEGIN')return {rows:[]};
  if(sql.startsWith('SELECT amount_cents'))return {rows:[]};
  if(sql==='ROLLBACK')return {rows:[]};
  throw Error('UNEXPECTED_SQL');
 },release(){}}}};
 await assert.rejects(issueVerifiedArchivedShopDocument(pool,{
  companyId:'11111111-1111-4111-8111-111111111111',
  orderId:'33333333-3333-4333-8333-333333333333',
  kind:'invoice',year:2026,content:{totalCents:1190},
  requirePaid:false,archive:false
 }),/SHOP_DOCUMENT_PAYMENT_NOT_CONFIRMED/);
 assert.equal(connected,true);
});
