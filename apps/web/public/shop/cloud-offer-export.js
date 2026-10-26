import {validateOffer,offerId} from './offer-policy.js';
export function exportCloudOffers(rows,{state,now=new Date()}={}){
 if(!Array.isArray(rows)||!rows.length||rows.length>200||!['draft','archived'].includes(state)||new Set(rows.map(row=>row?.id)).size!==rows.length)throw Error('INVALID_RESPONSE');
 const offers=rows.map(row=>{if(!offerId(row?.id)||row.state!==state||!Number.isSafeInteger(row.revision)||row.revision<1)throw Error('INVALID_RESPONSE');return {...validateOffer(row.offer),id:row.id};});
 return {format:'bringness-offer-drafts',version:1,exportedAt:now.toISOString(),publication:'draft-only',source:'loaded-account-results',scope:state,offers};
}
