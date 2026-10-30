import {marketplaceTestPreflight} from './shop-mollie-marketplace-preflight.js';
import {createMarketplaceConnections} from './shop-mollie-marketplace-connection.js';
import {createMarketplaceMollieTestResolver} from './shop-mollie-marketplace-test-adapter.js';

// Explicit trusted-host composition for isolated acceptance. Production start.js
// deliberately does not import this module. No environment or platform-key fallback.
export function createMarketplaceTestIntegration(pool,config){
 config={...config};
 const merchantConnections=createMarketplaceConnections(pool,config);
 const checkoutProviderResolver=merchantConnections.configured?createMarketplaceMollieTestResolver({
  loadConnection:merchantConnections.loadConnection,withAccessToken:merchantConnections.withAccessToken,
  publicOrigin:config.publicOrigin,fetcher:config.fetcher,webhookEnabled:true
 }):null;
 return {merchantConnections,checkoutProviderResolver,preflight(registration){return marketplaceTestPreflight(config,registration);}};
}
