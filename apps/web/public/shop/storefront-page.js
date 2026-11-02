import {mountStoreEditor,mountStorefront} from './storefront-ui.js';
import {mountShopWorkspace} from './shop-workspace-ui.js';
import {mountMarketplaceApproval} from './marketplace-approval-ui.js';
import {listSellerOffers,readSellerOffer,sendSellerCommand,pendingSellerRequest} from './seller-account-client.js';
if(document.body.dataset.store==='editor'){
 let editor;const workspace=mountShopWorkspace({window,onReadiness:r=>editor?.setMerchantApproved(r.merchantApproved),drafts:{list:listSellerOffers,read:readSellerOffer,save:sendSellerCommand,pending:pendingSellerRequest}});
 editor=mountStoreEditor({window,onState:s=>{if(s)workspace.setShop();}});
 const approval=mountMarketplaceApproval({window});
 document.getElementById('store-load').addEventListener('click',()=>approval.load());
}else mountStorefront({window});
