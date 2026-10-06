import test from 'node:test';
import assert from 'node:assert/strict';
import {beginRestaurantMollieConnect,mollieConnectConfiguration} from './center-mollie-connect.js';
const config={CENTER_MOLLIE_CLIENT_SECRET:'test-secret',CENTER_MOLLIE_TOKEN_KEY:'a'.repeat(64),CENTER_MOLLIE_CLIENT_ID:'app_test',CENTER_MOLLIE_REDIRECT_URI:'https://example.test/api/v1/centers/mollie/callback'};
test('missing platform configuration blocks redirect without creating state',async()=>assert.equal((await beginRestaurantMollieConnect({query(){throw Error('no query')}},{},'a','b',{})).status,503));
test('OAuth redirect requires HTTPS',()=>assert.equal(mollieConnectConfiguration({...config,CENTER_MOLLIE_REDIRECT_URI:'http://example.test/callback'}),null));
test('merchant authorization binds ownership and stores only hashed state',async()=>{
 const result=await beginRestaurantMollieConnect({query:async(sql,args)=>{assert.match(sql,/c.company_id=\$5 AND r.company_id=\$5/);assert.match(sql,/10 minutes/);assert.equal(args[4],'company');assert.match(args[0],/^[a-f0-9]{64}$/);return {rows:[{state_hash:args[0]}]};}},{id:'user',company_id:'company'},'center','restaurant',config);
 assert.equal(result.status,200);const url=new URL(result.authorizationUrl);assert.equal(url.origin,'https://my.mollie.com');assert.equal(url.searchParams.get('response_type'),'code');assert.match(url.searchParams.get('state'),/^[a-f0-9]{64}$/);
});
test('unowned restaurant cannot initiate connection',async()=>assert.equal((await beginRestaurantMollieConnect({query:async()=>({rows:[]})},{id:'user',company_id:'company'},'a','b',config)).status,404));

import {beginRestaurantPaymentConnect} from './center-payment-providers.js';
test('unsupported providers cannot fall back to Mollie',async()=>assert.equal((await beginRestaurantPaymentConnect({query(){throw Error('must not access Mollie')}},{},'a','b','other',{})).status,422));

import {encryptMerchantTokens,decryptMerchantTokens,completeRestaurantMollieConnect} from './center-mollie-connect.js';
test('token encryption rejects tampering and another restaurant identity',()=>{
 const tokens={access_token:'secret-access',refresh_token:'secret-refresh'},encrypted=encryptMerchantTokens(tokens,'restaurant',config);
 assert.equal(encrypted.includes('secret'),false);assert.deepEqual(decryptMerchantTokens(encrypted,'restaurant',config),tokens);
 assert.throws(()=>decryptMerchantTokens(encrypted,'other',config));assert.throws(()=>decryptMerchantTokens(encrypted.slice(0,-8),'restaurant',config));
});
test('callback rejects expired or replayed state before provider access',async()=>{
 const r=await completeRestaurantMollieConnect({query:async sql=>{assert.match(sql,/s.browser_hash=\$2/);assert.match(sql,/expires_at>now()/);return {rows:[]};}},{state:'a'.repeat(64),code:'code'},'b'.repeat(64),config,()=>{throw Error('must not call')});assert.equal(r.status,400);
});
test('callback stores encrypted tokens and keeps payments pending',async()=>{
 let n=0;const r=await completeRestaurantMollieConnect({query:async(sql,args)=>{n++;if(n===1)return {rows:[{center_id:'center',restaurant_id:'restaurant',user_id:'user'}]};assert.match(sql,/payment_status='pending'/);assert.match(sql,/profile_id=NULL,organization_id=NULL,verified_at=NULL/);assert.equal(args[2].includes('secret-access'),false);return {rows:[{restaurant_id:'restaurant'}]};}},{state:'a'.repeat(64),code:'code'},'b'.repeat(64),config,async(url,options)=>{assert.equal(url,'https://api.mollie.com/oauth2/tokens');assert.equal(options.body.get('grant_type'),'authorization_code');return {ok:true,json:async()=>({access_token:'secret-access',refresh_token:'secret-refresh',expires_in:3600})};});assert.equal(r.connected,true);assert.equal(r.paymentsEnabled,false);assert.equal(JSON.stringify(r).includes('secret-access'),false);
});
test('declined consent consumes state without storing credentials',async()=>{
 const r=await completeRestaurantMollieConnect({query:async()=>({rows:[{center_id:'center',restaurant_id:'restaurant'}]})},{state:'a'.repeat(64),error:'access_denied'},'b'.repeat(64),config,()=>{throw Error('no exchange')});assert.equal(r.status,400);
});

