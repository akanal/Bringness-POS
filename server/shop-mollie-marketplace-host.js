import {marketplaceTestPreflight} from './shop-mollie-marketplace-preflight.js';

// Explicit test-only host composition. No generated key, platform credential
// fallback, provider call, timer or environment mutation during construction.
export function composeMarketplaceTestHost(pool, {env={}, appMode='pos', isolated=false, marketplaceEnabled=false, createIntegration}={}) {
 const config={publicOrigin:env.SHOP_MARKETPLACE_PUBLIC_ORIGIN,clientId:env.SHOP_MARKETPLACE_MOLLIE_CLIENT_ID,clientSecret:env.SHOP_MARKETPLACE_MOLLIE_CLIENT_SECRET,tokenKey:env.SHOP_MARKETPLACE_TOKEN_KEY};
 const registration={callbackUrl:env.SHOP_MARKETPLACE_CALLBACK_URL,returnUrl:env.SHOP_MARKETPLACE_RETURN_URL,webhookUrl:env.SHOP_MARKETPLACE_WEBHOOK_URL};
 const preflight=marketplaceTestPreflight(config,registration);
 const requested=env.SHOP_MARKETPLACE_TEST_CHECKOUT_ENABLED==='true';
 const allowed=marketplaceEnabled===true && appMode!=='ai' && isolated===false;
 const enabled=allowed && requested && preflight.configurationValid && preflight.registrationMatches;
 let integration=null;
 if(enabled){if(typeof createIntegration!=='function')throw Error('MARKET_HOST_FACTORY_REQUIRED');integration=createIntegration(pool,Object.freeze({...config}));}
 const configured=enabled && typeof integration?.checkoutProviderResolver==='function' && !!integration?.merchantConnections;
 const schedulerRequested=env.SHOP_MARKETPLACE_TEST_RECONCILIATION_ENABLED==='true';
 function report({merchantStatus='not_connected',migrationsReady=false,schedulerRunning=false}={}) {
  const checks=[
   {code:'MARKETPLACE_HOST_ENABLED',ok:allowed},
   {code:'TEST_CHECKOUT_OPT_IN',ok:requested},
   ...preflight.checks.map(c=>({...c})),
   {code:'TEST_ADAPTER_CONFIGURED',ok:configured},
   {code:'MIGRATIONS_READY',ok:migrationsReady===true},
   {code:'MERCHANT_PROFILE_VERIFIED',ok:merchantStatus==='verified'},
   {code:'BACKGROUND_RECONCILIATION',ok:configured&&schedulerRequested&&schedulerRunning===true},
   {code:'REAL_MERCHANT_ACCEPTANCE',ok:false},
   {code:'PRODUCTION_ACCOUNTING_ACCEPTANCE',ok:false},
   {code:'PRODUCTION_FULFILMENT_ACCEPTANCE',ok:false}
  ];
  return {paymentMode:'test',testAdapterConfigured:configured,checks,blockers:checks.filter(c=>!c.ok).map(c=>c.code),productionReady:false,canPay:false,canFulfil:false};
 }
 return {merchantConnections:configured?integration.merchantConnections:null,checkoutProviderResolver:configured?integration.checkoutProviderResolver:null,schedulerEnabled:configured&&schedulerRequested,report};
}
