import test from 'node:test';
import assert from 'node:assert/strict';
import {beginRestaurantMollieConnect,mollieConnectConfiguration} from './center-mollie-connect.js';
const config={CENTER_MOLLIE_CLIENT_ID:'app_test',CENTER_MOLLIE_REDIRECT_URI:'https://example.test/callback'};
test('missing platform configuration blocks redirect without creating state',async()=>assert.equal((await beginRestaurantMollieConnect({query(){throw Error('no query')}},{},'a','b',{})).status,503));
test('OAuth redirect requires HTTPS',()=>assert.equal(mollieConnectConfiguration({...config,CENTER_MOLLIE_REDIRECT_URI:'http://example.test/callback'}),null));
test('merchant authorization binds ownership and stores only hashed state',async()=>{
 const result=await beginRestaurantMollieConnect({query:async(sql,args)=>{assert.match(sql,/c.company_id=\$5 AND r.company_id=\$5/);assert.match(sql,/10 minutes/);assert.equal(args[4],'company');assert.match(args[0],/^[a-f0-9]{64}$/);return {rows:[{state_hash:args[0]}]};}},{id:'user',company_id:'company'},'center','restaurant',config);
 assert.equal(result.status,200);const url=new URL(result.authorizationUrl);assert.equal(url.origin,'https://my.mollie.com');assert.equal(url.searchParams.get('response_type'),'code');assert.match(url.searchParams.get('state'),/^[a-f0-9]{64}$/);
});
test('unowned restaurant cannot initiate connection',async()=>assert.equal((await beginRestaurantMollieConnect({query:async()=>({rows:[]})},{id:'user',company_id:'company'},'a','b',config)).status,404));

import {beginRestaurantPaymentConnect} from './center-payment-providers.js';
test('unsupported providers cannot fall back to Mollie',async()=>assert.equal((await beginRestaurantPaymentConnect({query(){throw Error('must not access Mollie')}},{},'a','b','other',{})).status,422));
