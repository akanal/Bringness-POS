import {mountMarketplace} from './marketplace-ui.js';
import {mountMarketplaceSeller} from './marketplace-seller-ui.js';
if(document.body.dataset.market==='seller')mountMarketplaceSeller({window});else mountMarketplace({window});
