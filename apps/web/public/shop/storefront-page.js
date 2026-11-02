import {mountStoreEditor,mountStorefront} from './storefront-ui.js';
if(document.body.dataset.store==='editor')mountStoreEditor({window});else mountStorefront({window});
