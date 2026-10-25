import {checkoutUuid} from './checkout-state.js';
export const downloadHistoryFilters=Object.freeze(['all','prepared','uncertain','open','paid','failed','canceled']);
export function validDownloadHistory(page){
 if(!page||page.version!==1||typeof page.scope!=='string'||!/^[a-f0-9]{64}$/.test(page.scope)||!downloadHistoryFilters.includes(page.status)||typeof page.checkedAt!=='string'||!Number.isFinite(Date.parse(page.checkedAt))||page.canPay!==false||page.canActivate!==false||page.checkoutConnected!==false||!Array.isArray(page.items)||page.items.length>10||!(page.nextCursor===null||typeof page.nextCursor==='string'&&/^[A-Za-z0-9_-]{1,512}$/.test(page.nextCursor))||!page.items.length&&page.nextCursor!==null)return false;
 const seen=new Set();return page.items.every(item=>{
  if(!item||!checkoutUuid(item.id)||seen.has(item.id))return false;seen.add(item.id);
  return item.productId==='pos-download'&&item.planCode==='download_license'&&item.period==='once'&&item.currency==='EUR'&&downloadHistoryFilters.includes(item.status)&&item.status!=='all'&&(page.status==='all'||item.status===page.status)&&typeof item.createdAt==='string'&&Number.isFinite(Date.parse(item.createdAt))&&['none','test','live'].includes(item.paymentMode)&&item.licence==='blocked'&&item.purchaseCompleted===false&&['netCents','vatCents','grossCents'].every(k=>Number.isSafeInteger(item[k])&&item[k]>=0&&item[k]<=2147483647)&&item.netCents>0&&item.netCents+item.vatCents===item.grossCents&&Math.round(item.netCents*19/100)===item.vatCents;
 });
}
const error=code=>Object.assign(Error(code),{code});
export async function readDownloadHistory({token,status='all',cursor=null,signal,fetcher=globalThis.fetch}){
 if(typeof token!=='string'||!token||token.length>512||/\s/.test(token))throw error('UNAUTHORIZED');if(!downloadHistoryFilters.includes(status)||cursor!==null&&(typeof cursor!=='string'||!/^[A-Za-z0-9_-]{1,512}$/.test(cursor)))throw error('INVALID_REQUEST');
 const params=new URLSearchParams({status});if(cursor!==null)params.set('cursor',cursor);
 let response,page;try{response=await fetcher('/api/v1/shop/downloads/history?'+params,{method:'GET',headers:{Authorization:'Bearer '+token},credentials:'omit',mode:'same-origin',cache:'no-store',redirect:'error',signal});page=await response.json();}catch{throw error('SHOP_UNAVAILABLE');}
 if(!response.ok)throw error(typeof page?.code==='string'&&/^[A-Z_]{1,50}$/.test(page.code)?page.code:'SHOP_UNAVAILABLE');
 if(!validDownloadHistory(page)||page.status!==status)throw error('INVALID_RESPONSE');return page;
}
