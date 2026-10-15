import {billingPolicy} from './billing-policy.js';

// Quote several optional modules together without activating any entitlement.
// Prices not yet configured are explicitly left unresolved, never charged as zero.
const catalog={
 table_qr_monthly:{items:['table_qr_monthly','table_management_monthly'],amountNetCents:3989},
 personnel_monthly:{items:['personnel_monthly'],amountNetCents:1499},
 display_control_monthly:{items:['display_control_monthly'],amountNetCents:999},
 waiter_order_monthly:{items:['waiter_order_monthly'],amountNetCents:null},
 center_monthly:{items:['center_monthly','table_management_monthly'],amountNetCents:3989}
};
export function planModuleBasket({base=false,download=false,baseAccess=base,restaurant=false,tableQr=false,activeModules=[],requestedModules=[]}={}){
 const policy=billingPolicy({base,download,baseAccess,restaurant,tableQr});
 if(!policy.features.pos_base) throw new Error('BASE_LICENSE_REQUIRED');
 if(!Array.isArray(requestedModules)||requestedModules.length===0) throw new Error('EMPTY_BASKET');
 if(new Set(requestedModules).size!==requestedModules.length) throw new Error('DUPLICATE_MODULE');
 const active=new Set(activeModules);
 if(restaurant) active.add('restaurant_monthly');
 if(tableQr) active.add('table_qr_monthly');
 const lines=[];
 const needsTables=requestedModules.includes('center_monthly')||requestedModules.includes('table_qr_monthly');
 const tablesAlreadyIncluded=tableQr||active.has('table_management_monthly');
 for(const module of requestedModules){
  if(!Object.hasOwn(catalog,module)) throw new Error('UNKNOWN_MODULE');
  if(active.has(module)) throw new Error('MODULE_ALREADY_ACTIVE');
  const option={...catalog[module]};
  if(needsTables && module==='center_monthly' && (requestedModules.includes('table_qr_monthly')||tablesAlreadyIncluded)) option.amountNetCents=2999;
  if(needsTables && module==='table_qr_monthly' && tablesAlreadyIncluded) option.amountNetCents=2999;
  if(needsTables && module==='table_qr_monthly' && requestedModules.includes('center_monthly')) option.amountNetCents=3989;
  lines.push({module,...option});
 }
 // Shared table management is billed once even if Center and QR are selected together.
 if(requestedModules.includes('center_monthly')&&requestedModules.includes('table_qr_monthly')){
  const centerLine=lines.find(x=>x.module==='center_monthly');
  centerLine.amountNetCents=2999;
 }
 const unresolved=lines.filter(x=>x.amountNetCents===null).map(x=>x.module);
 return {lines,amountNetCents:unresolved.length?null:lines.reduce((sum,x)=>sum+x.amountNetCents,0),unpricedModules:unresolved,currency:'EUR',grantAccess:false,requiresVerifiedPayment:true};
}
export function planModuleCheckout({requestedModule,...state}={}){
 const basket=planModuleBasket({...state,requestedModules:[requestedModule]});
 const line=basket.lines[0];
 return {...line,currency:basket.currency,grantAccess:false,requiresVerifiedPayment:true};
}
export function mayActivateModule({verifiedPayment=false,paymentStatus,subscriptionActive=false}={}){
 return verifiedPayment===true&&paymentStatus==='paid'&&subscriptionActive===true;
}
