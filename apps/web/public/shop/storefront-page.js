import {mountStoreEditor,mountStorefront} from './storefront-ui.js';
import {mountShopWorkspace} from './shop-workspace-ui.js';
import {mountMarketplaceApproval} from './marketplace-approval-ui.js';
import {listSellerOffers,readSellerOffer,sendSellerCommand,pendingSellerRequest} from './seller-account-client.js';
if(document.body.dataset.store==='editor'){
 const workspace=mountShopWorkspace({window,drafts:{list:listSellerOffers,read:readSellerOffer,save:sendSellerCommand,pending:pendingSellerRequest}});
 mountStoreEditor({window,onState:s=>{if(s)workspace.setShop();}});
 const approval=mountMarketplaceApproval({window});
 document.getElementById('store-load').addEventListener('click',()=>approval.load());
}else mountStorefront({window});
