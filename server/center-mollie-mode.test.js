import test from 'node:test';
import assert from 'node:assert/strict';
import {molliePaymentMode,molliePaymentReadUrl} from './center-mollie-mode.js';
test('OAuth payment creation defaults to test and requires explicit live mode',()=>{
 assert.equal(molliePaymentMode({}),'test');
 assert.equal(molliePaymentMode({CENTER_MOLLIE_MODE:'test'}),'test');
 assert.equal(molliePaymentMode({CENTER_MOLLIE_MODE:'live'}),'live');
 assert.throws(()=>molliePaymentMode({CENTER_MOLLIE_MODE:'production'}),/INVALID_MOLLIE_MODE/);
});
test('test mode follows payment retrieval and pagination',()=>{
 const url=molliePaymentReadUrl('/v2/payments?profileId=pfl_one&from=tr_next','test');
 assert.equal(url.searchParams.get('testmode'),'true');
 assert.equal(url.searchParams.get('profileId'),'pfl_one');
 assert.equal(url.searchParams.get('from'),'tr_next');
 assert.equal(molliePaymentReadUrl('/v2/payments/tr_one','test').searchParams.get('testmode'),'true');
 assert.equal(molliePaymentReadUrl(url.href,'live').searchParams.has('testmode'),false);
});
test('payment mode URL cannot redirect merchant tokens to another host',()=>{
 assert.throws(()=>molliePaymentReadUrl('https://other.test/v2/payments','test'),/INVALID_PAYMENT_URL/);
 assert.throws(()=>molliePaymentReadUrl('/v2/organizations/me','test'),/INVALID_PAYMENT_URL/);
 assert.throws(()=>molliePaymentReadUrl('/v2/payments','unknown'),/INVALID_MOLLIE_MODE/);
});
