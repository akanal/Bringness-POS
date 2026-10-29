import test from 'node:test';
import assert from 'node:assert/strict';
import {authorizeShopDocumentAccess} from './shop-document-access-policy.js';
const base={actor:{id:'staff-1',companyId:'company-1',role:'staff'},companyId:'company-1',action:'read'};
test('permits only explicitly granted actions',()=>{
 assert.equal(authorizeShopDocumentAccess(base).actorId,'staff-1');
 assert.equal(authorizeShopDocumentAccess({...base,actor:{...base.actor,role:'accountant'},action:'export'}).action,'export');
});
test('denies cross-company, unknown roles and unauthorized exports',()=>{
 for(const changes of [
  {companyId:'company-2'},
  {actor:{...base.actor,role:'visitor'}},
  {action:'export'},
  {actor:{...base.actor,id:''}},
  {action:'delete'}
 ])assert.throws(()=>authorizeShopDocumentAccess({...base,...changes}),/SHOP_DOCUMENT_/);
});
