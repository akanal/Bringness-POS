import {checkoutUuid,checkoutStatuses} from './checkout-state.js';
export const paymentReturnHref=id=>{if(!checkoutUuid(id))throw Error('INVALID_REQUEST');return '/shop/payment-return.html#checkout='+id.toLowerCase();};
export function readPaymentReturnLocation(href){
 if(typeof href!=='string'||href.length>4096)return null;
 try{const u=new URL(href,'https://shop.invalid');if(u.pathname!=='/shop/payment-return.html'||u.search&&u.hash)return null;
  const p=new URLSearchParams(u.search||u.hash.replace(/^#/,''));if([...p.keys()].some(k=>k!=='checkout')||p.getAll('checkout').length!==1||!checkoutUuid(p.get('checkout')))return null;return p.get('checkout').toLowerCase();
 }catch{return null;}
}
export function legacyPaymentReturn(href){
 if(typeof href!=='string'||href.length>4096)return null;
 try{const u=new URL(href,'https://shop.invalid'),p=u.searchParams;if(!['/shop/','/shop/index.html'].includes(u.pathname)||!p.has('checkout')&&!p.has('order'))return null;
  if(u.hash||[...p.keys()].some(k=>!['checkout','order'].includes(k))||p.getAll('checkout').length!==1||p.getAll('order').length!==1||p.get('checkout')!=='return'||!checkoutUuid(p.get('order')))return {invalid:true};return {id:p.get('order').toLowerCase()};
 }catch{return null;}
}
export function validPaymentReturnOrder(order,id){
 const s=order?.snapshot,plan=s?.productId==='pos-online'?'pos_base_monthly':s?.productId==='pos-download'?'download_license':null;
 return Boolean(plan&&order.version===1&&checkoutUuid(id)&&order.id===id&&checkoutUuid(order.draftId)&&checkoutUuid(order.requestId)&&Object.hasOwn(checkoutStatuses,order.status)&&order.canPay===false&&order.canActivate===false&&order.checkoutConnected===false&&s.planCode===plan&&s.period===(s.productId==='pos-online'?'monthly':'once')&&s.currency==='EUR'&&['netCents','vatCents','grossCents'].every(k=>Number.isSafeInteger(s[k])&&s[k]>=0&&s[k]<=2147483647)&&s.netCents>0&&s.netCents+s.vatCents===s.grossCents&&Math.round(s.netCents*19/100)===s.vatCents);
}
