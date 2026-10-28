import {exactMarket,marketInteger,marketText,marketFail} from './market-policy.js';
export const marketCarriers={dhl:'DHL',other:'Anderer Versanddienst'};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function marketTracking(value){
 exactMarket(value,['carrier','carrierName','number']);
 if(!Object.hasOwn(marketCarriers,value.carrier))marketFail('INVALID_MARKET_INPUT');
 const number=marketText(value.number,80),carrierName=marketText(value.carrierName,80);
 if(!/^[A-Za-z0-9][A-Za-z0-9-]{2,79}$/.test(number)||value.carrier==='dhl'&&carrierName!=='DHL')marketFail('INVALID_MARKET_INPUT');
 return {carrier:value.carrier,carrierName,number};
}
export function marketTrackingCommand(c){
 exactMarket(c,['requestId','orderId','expectedRevision','tracking']);
 if(!uuid.test(c.requestId)||!uuid.test(c.orderId))marketFail('INVALID_MARKET_INPUT');
 marketInteger(c.expectedRevision,2147483646);
 return {...c,tracking:marketTracking(c.tracking)};
}
export function marketTrackingUrl(value){
 const t=marketTracking(value);
 return t.carrier==='dhl'?'https://www.dhl.de/de/privatkunden/pakete-empfangen/verfolgen.html?piececode='+encodeURIComponent(t.number):null;
}
