import {moduleCatalog,moduleBookingError} from './module-catalog.js';
// Legacy restaurant contracts keep their existing included functions, never offered anew.
export function billingPolicy({base=false,restaurant=false,tableQr=false,download=false,baseAccess=base,tableManagement=false,counterQr=false,center=false,personnel=false,kitchen=false,eanScanner=false,displayControl=false,legacyTableQr=false}={}) {
 const hasBase=Boolean(baseAccess||base||restaurant||download),tables=hasBase&&(restaurant||tableManagement||legacyTableQr);
 const features={display_control:hasBase&&(restaurant||displayControl),ean_scanner:hasBase&&eanScanner,pos_base:hasBase,restaurant,table_management:tables,table_qr:tables&&tableQr,counter_qr:tables&&counterQr,center:tables&&(restaurant||center),personnel:hasBase&&(restaurant||personnel),kitchen:hasBase&&(restaurant||kitchen)};
 const plans={pos_base_monthly:{active:base,eligible:!base&&!restaurant&&!download,requires:[],included:restaurant||download},restaurant_monthly:{active:restaurant,eligible:false,requires:[],retired:true},download_license:{active:download,eligible:!download&&!base&&!restaurant,requires:[]}};
 for(const [code,plan] of Object.entries(moduleCatalog)){const active=Boolean(features[plan.feature]);plans[code]={active,eligible:!active&&!moduleBookingError(code,{...features,center:hasBase&&center}),requires:plan.requires,included:restaurant&&['table_management','personnel','kitchen','center','display_control'].includes(plan.feature)}}
 return {features,plans};
}
