// Latest confirmed net purchase price per stock unit; no estimated prices.
export function recipeCost(items){
 if(!Array.isArray(items))throw Error('Ungültige Rezeptpositionen');
 let subtotal=0;const missingStockIds=[];
 for(const item of items){
  if(!item||typeof item!=='object'||Array.isArray(item))throw Error('Ungültige Rezeptposition');
  const quantity=Number(item.quantity),price=item.unit_cents==null?NaN:Number(item.unit_cents);
  if(!Number.isFinite(quantity)||quantity<=0||!Number.isFinite(price)||price<0){missingStockIds.push(item.stock_id);continue}
  const next=subtotal+quantity*price;if(!Number.isSafeInteger(Math.round(next)))throw Error('Rezeptkosten überschreiten sichere Berechnungsgrenze');subtotal=next;
 }
 const complete=items.length>0&&missingStockIds.length===0;
 return {complete,netCents:complete?Math.round(subtotal):null,knownNetCents:Math.round(subtotal),missingStockIds,basis:'Letzter bestätigter Wareneingang je Zutat; netto, ohne Lieferkosten, Personal und Gemeinkosten.'};
}

export function purchaseEstimate(suggestions){
 const items=suggestions.map(item=>{
  const qty=Number(item.suggestedQuantity),price=item.unitCents==null?NaN:Number(item.unitCents);
  if(!Number.isFinite(qty)||qty<0||!Number.isSafeInteger(Math.round(qty*1000)))throw new Error('Ungültige Nachbestellmenge');
  const estimatedNetCents=qty===0?0:Number.isFinite(price)&&price>=0?Math.round(qty*price):null;
  const size=Number(item.packQuantity),hasPack=item.packQuantity!=null&&Number.isFinite(size)&&size>=.001&&Number.isSafeInteger(Math.round(size*1000))&&Math.abs(size*1000-Math.round(size*1000))<.00001;
  const packs=qty===0?0:hasPack?Math.ceil(Math.round(qty*1000)/Math.round(size*1000)):null;
  const purchaseQuantity=packs==null?null:Math.round(packs*size*1000)/1000;
  const surplusQuantity=purchaseQuantity==null?null:Math.round((purchaseQuantity-qty)*1000)/1000;
  const estimatedPackNetCents=purchaseQuantity===0?0:purchaseQuantity!=null&&Number.isFinite(price)&&price>=0?Math.round(purchaseQuantity*price):null;
  for(const cents of [estimatedNetCents,estimatedPackNetCents])if(cents!==null&&!Number.isSafeInteger(cents))throw Error('Einkaufskosten überschreiten sichere Berechnungsgrenze');
  return {...item,estimatedNetCents,packs,purchaseQuantity,surplusQuantity,estimatedPackNetCents};
 });
 const missingStockIds=items.filter(i=>i.estimatedNetCents===null).map(i=>i.stockId);
 const knownNetCents=items.reduce((n,i)=>n+(i.estimatedNetCents??0),0);
 if(!Number.isSafeInteger(knownNetCents))throw Error('Einkaufssumme zu groß');
 const packComplete=items.every(i=>i.estimatedPackNetCents!==null),knownPackNetCents=items.reduce((n,i)=>n+(i.estimatedPackNetCents??0),0);
 if(!Number.isSafeInteger(knownPackNetCents))throw Error('Packungssumme zu groß');
 return {items,packComplete,packNetCents:packComplete?knownPackNetCents:null,knownPackNetCents,complete:missingStockIds.length===0,netCents:missingStockIds.length?null:knownNetCents,knownNetCents,missingStockIds};
}
