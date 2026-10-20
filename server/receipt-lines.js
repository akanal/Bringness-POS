import {lineDiscount} from './sale-discount.js';

// Presentation only: retain original per-line tax rounding and never mutate records.
export function receiptLines(items, adjustment) {
  const merchandise=[], deposits=new Map();
  for(const item of items){
    const grossCents=Math.round(Number(item.unit_price_cents)*Number(item.quantity))-lineDiscount(adjustment,item.product_id);
    const netCents=Math.round(grossCents/(1+Number(item.tax_rate_snapshot)/100));
    const row={...item,grossCents,netCents,taxCents:grossCents-netCents};
    // Financial lines have no product. A merchandise name alone must not classify it.
    const kind=!item.product_id && /^Pfand:/.test(item.product_name_snapshot)?'charge':
      !item.product_id && /^Pfandrücknahme:/.test(item.product_name_snapshot)?'return':null;
    if(!kind){merchandise.push(row);continue;}
    const key=kind+':'+Number(item.unit_price_cents), existing=deposits.get(key);
    if(existing){
      existing.quantity+=Number(item.quantity);
      existing.grossCents+=grossCents;existing.netCents+=netCents;existing.taxCents+=row.taxCents;
      if(Number(existing.tax_rate_snapshot)!==Number(item.tax_rate_snapshot))existing.mixedTax=true;
    }else deposits.set(key,{...row,quantity:Number(item.quantity),product_name_snapshot:kind==='charge'?'Pfand':'Pfandrücknahme'});
  }
  return [...merchandise,...deposits.values()];
}
