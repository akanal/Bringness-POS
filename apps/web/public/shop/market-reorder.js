import {marketLines,marketGross,marketMoney} from './market-policy.js';
// Immutable stock allocations identify the exact offer; names/SKUs alone never do.
export async function prepareMarketReorder(order,read){
 const refs=order.reorderReferences;
 if(!Array.isArray(refs)||!refs.length||refs.length>20||typeof order.sellerId!=='string')throw Error('INVALID_RESPONSE');
 const seen=new Set(),offers=new Map(),items=[],unavailable=[];
 for(const ref of refs){
  const key=JSON.stringify([ref.id,ref.sku]);if(seen.has(key))throw Error('INVALID_RESPONSE');seen.add(key);
  marketLines([{...ref,revision:1,unitNetCents:1}]);
  let p;
  try{if(!offers.has(ref.id))offers.set(ref.id,await read(ref.id));p=offers.get(ref.id);}
  catch(e){if(e.code==='OFFER_NOT_FOUND'){unavailable.push(ref.sku+' · Angebot nicht verfügbar');continue;}throw e;}
  if(p.id!==ref.id||p.sellerId!==order.sellerId||p.state!=='published')throw Error('INVALID_RESPONSE');
  const v=p.variants.find(v=>v.sku===ref.sku);
  if(!v||v.stock<ref.quantity||!p[order.method]){unavailable.push(ref.sku+' · Gewünschte Menge oder Erhaltart nicht verfügbar');continue;}
  const line={id:p.id,revision:p.revision,sku:v.sku,quantity:ref.quantity,unitNetCents:v.netCents};marketLines([line]);
  items.push({title:p.title,label:v.label,seller:p.seller.name+' · '+p.seller.email,sellerId:p.sellerId,shipping:p.shipping,pickup:p.pickup,shippingNetCents:p.shippingNetCents,line,display:ref.quantity+' × '+p.title+' · '+v.label+' · aktuell '+marketMoney(marketGross(v.netCents,v.vatBasisPoints))+' je Stück inkl. MwSt. · Bestand '+v.stock});
 }
 return {items,unavailable};
}
