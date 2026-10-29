import test from 'node:test';
import assert from 'node:assert/strict';
import {digestShopDocument,verifyShopDocumentDigest} from './shop-document-archive-policy.js';
test('document digest is stable regardless of object key order',()=>{
 const first={invoice:'INV-2026-000000001',totals:{net:100,tax:19}};
 const second={totals:{tax:19,net:100},invoice:'INV-2026-000000001'};
 const digest=digestShopDocument(first);
 assert.deepEqual(digest,digestShopDocument(second));
 assert.equal(verifyShopDocumentDigest(second,digest),true);
 assert.equal(verifyShopDocumentDigest({...second,totals:{tax:20,net:100}},digest),false);
});
test('rejects unsupported values and invalid digest',()=>{
 assert.throws(()=>digestShopDocument({value:Infinity}),/SHOP_ARCHIVE_/);
 assert.throws(()=>digestShopDocument({value:1.5}),/SHOP_ARCHIVE_/);
 assert.throws(()=>digestShopDocument({value:undefined}),/SHOP_ARCHIVE_/);
 assert.throws(()=>verifyShopDocumentDigest({value:1},{algorithm:'sha256',digest:'abc'}),/SHOP_ARCHIVE_/);
});
