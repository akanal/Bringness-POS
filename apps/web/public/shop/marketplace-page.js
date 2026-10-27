import {mountMarketplaceApproval} from './marketplace-approval-ui.js';
import {mountMarketplace} from './marketplace-ui.js';
import {mountMarketplaceSeller} from './marketplace-seller-ui.js';
if(document.body.dataset.market==='seller'){mountMarketplaceSeller({window});mountMarketplaceApproval({window});}else if(document.body.dataset.market==='review')mountMarketplaceApproval({window,admin:true});else mountMarketplace({window});
