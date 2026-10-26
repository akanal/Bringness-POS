import {validateOffer} from './offer-policy.js';
export {validateOffer} from './offer-policy.js';
export const draftKey='bringness.marketplace.offer-drafts.v1';
export const offerKinds=Object.freeze(['physical','digital','service']);
export function loadOffers(storage){const raw=storage.getItem(draftKey);if(!raw)return [];if(raw.length>600000)throw Error('Entwurfsspeicher ist zu groß.');const rows=JSON.parse(raw);if(!Array.isArray(rows)||rows.length>50)throw Error('Entwurfsspeicher ist ungültig.');return rows.map(row=>{if(!row||typeof row.id!=='string'||!/^offer-[a-f0-9-]{36}$/.test(row.id))throw Error('Entwurfskennung ungültig.');return {...validateOffer(row),id:row.id};});}
export function saveOffers(storage,rows){if(rows.length>50)throw Error('Höchstens 50 Entwürfe pro Sitzung.');const validated=rows.map(row=>({...validateOffer(row),id:row.id}));storage.setItem(draftKey,JSON.stringify(validated));}
