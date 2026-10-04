// Latest confirmed net purchase price per stock unit; no estimated prices.
export function recipeCost(items){
 let subtotal=0;const missingStockIds=[];
 for(const item of items){
  const quantity=Number(item.quantity),price=item.unit_cents==null?NaN:Number(item.unit_cents);
  if(!Number.isFinite(quantity)||quantity<=0||!Number.isFinite(price)||price<0){missingStockIds.push(item.stock_id);continue}
  subtotal+=quantity*price;
 }
 const complete=items.length>0&&missingStockIds.length===0;
 return {complete,netCents:complete?Math.round(subtotal):null,knownNetCents:Math.round(subtotal),missingStockIds,basis:'Letzter bestätigter Wareneingang je Zutat; netto, ohne Lieferkosten, Personal und Gemeinkosten.'};
}
