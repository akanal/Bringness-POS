import test from 'node:test';
import assert from 'node:assert/strict';
import {composeMarketplaceTestHost} from './shop-mollie-marketplace-host.js';
const origin='https://bringness.de';
const env=()=>({SHOP_MARKETPLACE_PUBLIC_ORIGIN:origin,SHOP_MARKETPLACE_MOLLIE_CLIENT_ID:'app_fixture',SHOP_MARKETPLACE_MOLLIE_CLIENT_SECRET:'private_fixture_secret',SHOP_MARKETPLACE_TOKEN_KEY:'ab'.repeat(32),SHOP_MARKETPLACE_CALLBACK_URL:origin+'/api/v1/shop/marketplace/merchant-callback',SHOP_MARKETPLACE_RETURN_URL:origin+'/shop/marketplace-payment-return.html',SHOP_MARKETPLACE_WEBHOOK_URL:origin+'/api/v1/shop/marketplace/checkout-notification',SHOP_MARKETPLACE_TEST_CHECKOUT_ENABLED:'true',SHOP_MARKETPLACE_TEST_RECONCILIATION_ENABLED:'true'});
function setup(options={}){let calls=0;const resolver=()=>{};const host=composeMarketplaceTestHost({}, {env:env(),marketplaceEnabled:true,createIntegration(_pool,c){calls++;assert.ok(Object.isFrozen(c));return {merchantConnections:{status(){}},checkoutProviderResolver:resolver};},...options});return {host,calls,resolver};}
test('test host requires explicit opt-in, isolated and AI modes cannot configure it',()=>{
 for(const options of [{env:{}},{appMode:'ai'},{isolated:true},{marketplaceEnabled:false},{env:{...env(),SHOP_MARKETPLACE_TEST_CHECKOUT_ENABLED:'false'}}]){const {host,calls}=setup(options);assert.equal(calls,0);assert.equal(host.checkoutProviderResolver,null);assert.equal(host.schedulerEnabled,false);}
});
test('invalid secrets and each mismatched endpoint prevent construction',()=>{
 for(const overrides of [{SHOP_MARKETPLACE_MOLLIE_CLIENT_SECRET:'bad'},{SHOP_MARKETPLACE_TOKEN_KEY:'bad'},{SHOP_MARKETPLACE_CALLBACK_URL:origin+'/wrong'},{SHOP_MARKETPLACE_RETURN_URL:origin+'/wrong'},{SHOP_MARKETPLACE_WEBHOOK_URL:origin+'/wrong'}]){const {host,calls}=setup({env:{...env(),...overrides}});assert.equal(calls,0);assert.equal(host.checkoutProviderResolver,null);assert.ok(host.report().blockers.length);}
});
test('valid explicit configuration composes only test adapter and cannot grant production acceptance',()=>{
 const {host,calls,resolver}=setup();assert.equal(calls,1);assert.equal(host.checkoutProviderResolver,resolver);assert.equal(host.schedulerEnabled,true);
 const report=host.report({merchantStatus:'verified',migrationsReady:true,schedulerRunning:true,productionReady:true,canPay:true});
 assert.deepEqual(report.blockers,['REAL_MERCHANT_ACCEPTANCE','PRODUCTION_ACCOUNTING_ACCEPTANCE','PRODUCTION_FULFILMENT_ACCEPTANCE']);
 for(const key of ['productionReady','canPay','canFulfil'])assert.equal(report[key],false);
 assert.equal(report.paymentMode,'test');
});
test('reports snapshot protected configuration and never echo secrets or submitted addresses',()=>{
 const e=env(),{host}=setup({env:e});e.SHOP_MARKETPLACE_MOLLIE_CLIENT_SECRET='changed';e.SHOP_MARKETPLACE_CALLBACK_URL='secret-private-url';
 const r=host.report();r.checks[0].ok=false;r.blockers.length=0;
 const next=host.report();assert.equal(next.checks[0].ok,true);assert.ok(next.blockers.length);
 const json=JSON.stringify(next);for(const s of ['private_fixture_secret','ab'.repeat(32),'app_fixture','secret-private-url'])assert.ok(!json.includes(s));
});
test('scheduler opt-in is separate; no integration factory or platform keys bypass gates',()=>{
 const {host}=setup({env:{...env(),SHOP_MARKETPLACE_TEST_RECONCILIATION_ENABLED:'false'}});assert.equal(host.schedulerEnabled,false);
 const {host:blocked,calls}=setup({env:{MOLLIE_API_KEY:'live_do_not_use',SHOP_MARKETPLACE_TEST_CHECKOUT_ENABLED:'true'}});assert.equal(calls,0);assert.equal(blocked.checkoutProviderResolver,null);
 assert.throws(()=>composeMarketplaceTestHost({}, {env:env(),marketplaceEnabled:true}),/MARKET_HOST_FACTORY_REQUIRED/);
});
