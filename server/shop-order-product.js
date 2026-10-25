import {shopError} from './shop-account.js';
export function orderProduct(s){
 const match=s?.productId==='pos-online'?['pos_base_monthly','monthly']:s?.productId==='pos-download'?['download_license','once']:null;
 if(!match||s.planCode!==match[0]||s.period!==match[1]||s.currency!=='EUR')throw shopError('SHOP_UNAVAILABLE');
 if(!['netCents','vatCents','grossCents'].every(k=>Number.isSafeInteger(s[k])&&s[k]>=0&&s[k]<=2147483647)||s.netCents<1||s.netCents+s.vatCents!==s.grossCents||Math.round(s.netCents*19/100)!==s.vatCents)throw shopError('SHOP_UNAVAILABLE');
 return Object.fromEntries(['productId','planCode','period','currency','netCents','vatCents','grossCents'].map(k=>[k,s[k]]));
}
