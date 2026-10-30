import {createMarketplaceLiveReader} from './shop-mollie-marketplace-live-reader.js';
import {createMarketplaceSettlement} from './shop-payment-marketplace-settlement.js';
// Explicit trusted-host factory. No environment lookup, credential import,
// database migration, route, worker or financial write on construction.
export function createMarketplaceLiveAccounting(pool,{loadBinding,loadAcceptance,withAccessToken,fetcher,providerTimeoutMs}={}){
 if(typeof loadBinding!=='function'||typeof loadAcceptance!=='function'||typeof withAccessToken!=='function')throw Error('LIVE_ACCOUNTING_CONFIG_REQUIRED');
 const reader=createMarketplaceLiveReader({loadBinding,withAccessToken,fetcher});
 return createMarketplaceSettlement(pool,{loadBinding,loadAcceptance,...reader,...(providerTimeoutMs===undefined?{}:{providerTimeoutMs})});
}
