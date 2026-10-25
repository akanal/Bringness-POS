// Explicit synthetic acceptance used only by disposable TEST-flow fixtures.
import {migrateShopDownloadConsent} from '../../server/shop-download-fulfilment.js';
import {readShopDownloadInvoiceConsent,recordShopDownloadInvoiceConsent} from '../../server/shop-download-consent.js';
export const fixtureSeller={name:'Synthetic seller',street:'Example 2',postalCode:'10115',city:'Berlin',taxId:'SYNTHETIC-ONLY',country:'DE'};
export async function acceptFixtureDownloadConsent(pool,id){
 await migrateShopDownloadConsent(pool);
 const view=await readShopDownloadInvoiceConsent(pool,{token:'owner-a',id,seller:fixtureSeller});
 return recordShopDownloadInvoiceConsent(pool,{token:'owner-a',id,seller:fixtureSeller,accepted:true,acceptedDigest:view.digest});
}
