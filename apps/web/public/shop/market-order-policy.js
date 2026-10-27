import {exactMarket,marketInteger,marketFail} from './market-policy.js';
export const marketOrderLabels={received:'Eingegangen',accepted:'Angenommen',rejected:'Abgelehnt',cancelled:'Storniert',ready_for_pickup:'Abholbereit',shipped:'Versendet'};
export function marketOrderActions(status,method){
 if(status==='received')return ['accept','reject','cancel'];
 if(status==='accepted')return [method==='pickup'?'ready':'ship','cancel'];
 if(status==='ready_for_pickup')return ['cancel'];
 return [];
}
export function nextMarketOrder(status,method,action){
 if(!['shipping','pickup'].includes(method)||!marketOrderActions(status,method).includes(action))marketFail('INVALID_ORDER_TRANSITION');
 return {accept:'accepted',reject:'rejected',cancel:'cancelled',ready:'ready_for_pickup',ship:'shipped'}[action];
}
export function validateMarketOrderCommand(c){
 exactMarket(c,['requestId','orderId','expectedRevision','action']);
 const id=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
 if(!id.test(c.requestId)||!id.test(c.orderId)||!['accept','reject','cancel','ready','ship'].includes(c.action))marketFail('INVALID_MARKET_INPUT');
 marketInteger(c.expectedRevision,2147483646);return c;
}
