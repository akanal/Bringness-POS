import {gitBlob,prepareShopRegistrationStartup} from './integration-start.mjs';
export const livePublicOrigin='https://bringness.de';
// Explicit release transform; ordinary candidate generation stays default-disabled.
export function prepareLiveShopStartup(source){
 let result=prepareShopRegistrationStartup(source);
 const changes=[
  ["process.env.SHOP_DRAFTS_ENABLED==='true'","process.env.SHOP_DRAFTS_ENABLED!=='false'"],
  ["process.env.SHOP_REGISTRATION_ENABLED==='true'","process.env.SHOP_REGISTRATION_ENABLED!=='false'"],
  ['process.env.PUBLIC_BASE_URL||process.env.PUBLIC_URL',JSON.stringify(livePublicOrigin)]
 ];
 for(const [before,after] of changes){if(result.split(before).length!==2)throw Error('LIVE_SHOP_ANCHOR_CHANGED');result=result.replace(before,after);}
 return result;
}
export function prepareLiveShopIndex(source){
 if(gitBlob(source)!=='d280a86a9e98872d3f4d518f86fd762fc1e6385e')throw Error('LIVE_INDEX_SOURCE_CHANGED');
 const anchor='if(p==="/pos"||p==="/pos/")p="/pos/index.html";';
 if(source.split(anchor).length!==2)throw Error('LIVE_INDEX_ANCHOR_CHANGED');
 return source.replace(anchor,'if(p==="/shop"||p==="/shop/")p="/shop/index.html";'+anchor);
}
