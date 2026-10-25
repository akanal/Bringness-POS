import {supportedDownloadBuyer,supportedDownloadInvoiceDate,downloadInvoiceDate} from './shop-download-invoice-readiness.js';
import {billingQuote} from './billing-quote.js';
export const shopPlans=Object.freeze({'pos-online':'pos_base_monthly','pos-download':'download_license'});
export function validateShopCart(cart){
 if(!cart||typeof cart!=='object'||Array.isArray(cart)||![null,Object.prototype].includes(Object.getPrototypeOf(cart)))throw Error('INVALID_CART');
 const entries=Object.entries(cart);if(!entries.length||entries.length>2)throw Error('INVALID_CART');
 for(const [id,n]of entries)if(!Object.hasOwn(shopPlans,id)||!Number.isInteger(n)||n<1||n>99)throw Error('INVALID_CART');
 return Object.fromEntries(entries.sort(([a],[b])=>a.localeCompare(b)));
}
export function shopPreview({cart,plans,entitlements=[],features=[],profile={},now=new Date()}){
 cart=validateShopCart(cart);const at=new Date(now).getTime();if(!Number.isFinite(at))throw Error('INVALID_CLOCK');
 const issues=[];const lines=[];
 const active=entitlements.some(e=>['pos_base_monthly','download_license','restaurant_monthly'].includes(e.code)&&(e.status==='active'||(e.status==='canceled'&&(!e.current_period_end||new Date(e.current_period_end).getTime()>at))));
 const granted=features.some(f=>['pos_base','restaurant','download_license'].includes(f.feature_code)&&f.status==='active'&&f.payment_status!=='trial'&&(!f.ends_at||new Date(f.ends_at).getTime()>at||(f.grace_until&&new Date(f.grace_until).getTime()>at)));
 for(const [productId,quantity] of Object.entries(cart)){
  const planCode=shopPlans[productId],period=productId==='pos-online'?'monthly':'once';
  const plan=plans.find(p=>p.code===planCode&&p.active===true&&p.currency==='EUR'&&p.billing_type===(period==='monthly'?'monthly':'one_time'));
  if(!plan){issues.push('plan_unavailable');continue;}
  try{
   const unit=billingQuote(plan,plan).netCents,netCents=unit*quantity,vatCents=Number((BigInt(netCents)*19n+50n)/100n),grossCents=netCents+vatCents;
   if(!Number.isSafeInteger(grossCents)||grossCents>2147483647)throw Error();
   lines.push({productId,planCode,quantity,period,unitNetCents:unit,netCents,vatCents,grossCents});
  }catch{issues.push('invalid_server_price');}
  if(quantity!==1)issues.push('quantity_not_supported');
 }
 if(Object.keys(cart).length>1)issues.push('base_license_conflict');
 if(active||granted)issues.push('already_active');
 const profileComplete=['company_name','street','postal_code','city','country'].every(k=>typeof profile[k]==='string'&&profile[k].trim()&&profile[k].length<=500&&!/[\u0000-\u001f\u007f]/.test(profile[k]));
 if(!profileComplete)issues.push('billing_profile_incomplete');
 if(Object.hasOwn(cart,'pos-download')){
  if(profileComplete&&!supportedDownloadBuyer(profile))issues.push('download_buyer_unsupported');
  if(!supportedDownloadInvoiceDate(downloadInvoiceDate(at)))issues.push('download_invoice_format_not_ready');
 }
 return {version:1,currency:'EUR',vatRate:19,checkedAt:new Date(at).toISOString(),expiresAt:new Date(at+300000).toISOString(),lines,issues:[...new Set(issues)],account:{profileComplete:Boolean(profileComplete),hasBaseLicense:active||granted},canPay:false,canActivate:false,checkoutConnected:false};
}
