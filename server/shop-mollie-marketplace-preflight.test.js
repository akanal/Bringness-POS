import test from 'node:test';
import assert from 'node:assert/strict';
import {marketplaceTestPreflight} from './shop-mollie-marketplace-preflight.js';
const config = () => ({publicOrigin:'https://bringness.de',clientId:'app_fixture',clientSecret:'private_fixture_secret',tokenKey:'ab'.repeat(32),fetcher(){throw Error('must never contact provider');}});
const registration = () => ({callbackUrl:'https://bringness.de/api/v1/shop/marketplace/merchant-callback',returnUrl:'https://bringness.de/shop/marketplace-payment-return.html',webhookUrl:'https://bringness.de/api/v1/shop/marketplace/checkout-notification'});
test('matching local configuration never grants provider, merchant or production acceptance',()=>{
 const r=marketplaceTestPreflight({...config(),productionReady:true,canPay:true},registration());
 assert.equal(r.configurationValid,true);assert.equal(r.registrationMatches,true);
 for(const k of ['providerVerified','merchantAccepted','productionReady','canPay','canFulfil'])assert.equal(r[k],false);
 assert.equal(r.paymentMode,'test');
});
test('origins reject credentials, paths, fragments, queries, HTTP and normalization ambiguities',()=>{
 for(const publicOrigin of ['http://bringness.de','https://bringness.de/','https://bringness.de/a','https://bringness.de?key=secret','https://bringness.de#secret','https://user:secret@bringness.de','https://BRINGNESS.DE','https://bringness.de:443','bad',undefined]){
  const r=marketplaceTestPreflight({...config(),publicOrigin},registration());assert.equal(r.configurationValid,false);assert.equal(r.expected,null);assert.equal(r.registrationMatches,false);
 }
});
test('each missing or wrong registered endpoint blocks the local match, without echoing input',()=>{
 for(const key of Object.keys(registration()))for(const value of [undefined,'https://evil.test/private-secret',registration()[key]+'?x=secret',registration()[key]+'/',registration()[key].replace('https:','http:')]){
  const r=marketplaceTestPreflight(config(),{...registration(),[key]:value});assert.equal(r.registrationMatches,false);assert.ok(!JSON.stringify(r).includes('private-secret'));
 }
});
test('missing credentials and malformed secrets fail independently and never appear in output',()=>{
 for(const entry of [{clientId:'live_private'},{clientSecret:'short'},{clientSecret:'private secret'},{clientSecret:'x'.repeat(4097)},{tokenKey:'private_key'},{fetcher:true}]){
  const r=marketplaceTestPreflight({...config(),...entry},registration());assert.equal(r.configurationValid,false);
 }
 const serialized=JSON.stringify(marketplaceTestPreflight(config(),registration()));
 assert.ok(!serialized.includes(config().clientSecret));assert.ok(!serialized.includes(config().tokenKey));assert.ok(!serialized.includes(config().clientId));
 assert.equal(marketplaceTestPreflight().configurationValid,false);
});
test('result mutation cannot alter a subsequent report or caller configuration',()=>{
 const c=config(),original={...c},reg=registration(),r=marketplaceTestPreflight(c,reg);r.checks[0].ok=false;r.expected.callbackUrl='bad';
 assert.equal(marketplaceTestPreflight(c,reg).checks[0].ok,true);assert.deepEqual(c,original);assert.deepEqual(reg,registration());
});

test('integration captures its configuration and reports local checks without touching a database',async()=>{
 const {createMarketplaceTestIntegration}=await import('./shop-mollie-marketplace-integration.js');
 const c=config(),pool={query(){throw Error('unexpected database access');},connect(){throw Error('unexpected database access');}};
 const integration=createMarketplaceTestIntegration(pool,c);
 c.publicOrigin='https://other.test';c.clientSecret='changed';c.tokenKey='changed';
 assert.equal(integration.merchantConnections.configured,true);
 assert.equal(integration.preflight(registration()).registrationMatches,true);
 assert.equal(integration.preflight(registration()).configurationValid,true);
});
test('invalid credentials or transport cannot create a checkout resolver',async()=>{
 const {createMarketplaceTestIntegration}=await import('./shop-mollie-marketplace-integration.js');
 for(const invalid of [{clientSecret:'private secret'},{clientSecret:'x'.repeat(4097)},{tokenKey:'invalid'},{clientId:123},{fetcher:null}]){
  const integration=createMarketplaceTestIntegration({}, {...config(),...invalid});
  assert.equal(integration.merchantConnections.configured,false);assert.equal(integration.checkoutProviderResolver,null);
  assert.equal(integration.preflight(registration()).configurationValid,false);
 }
});
