export function compareForecast(snapshot,rows,items,today){
 const saved=snapshot.result,day=snapshot.day,complete=day<today;
 const totals=rows.filter(r=>r.day===day).reduce((a,r)=>({orders:a.orders+Number(r.orders),revenueCents:a.revenueCents+Number(r.revenue_cents)}),{orders:0,revenueCents:0});
 const ingredients=Array.isArray(saved.recipeMappings)&&Array.isArray(saved.suggestions)?saved.suggestions.map(x=>{
  const actualUse=saved.recipeMappings.filter(m=>m.stockId===x.stockId).reduce((n,m)=>n+items.filter(i=>i.day===day&&i.product_code===m.productCode).reduce((s,i)=>s+Number(i.quantity)*m.quantity,0),0);
  return {stockId:x.stockId,name:x.name,unit:x.unit,expectedUse:x.expectedUse,actualUse:Math.round(actualUse*1000)/1000,difference:Math.round((actualUse-x.expectedUse)*1000)/1000};
 }):null;
 return {day,capturedAt:snapshot.captured_at,complete,ready:!!saved.ready,ordersBand:saved.ordersBand||null,actualOrders:totals.orders,ordersDifference:saved.ready?totals.orders-saved.expectedOrders:null,withinOrdersBand:saved.ready&&complete&&saved.ordersBand?totals.orders>=saved.ordersBand.low&&totals.orders<=saved.ordersBand.high:null,ingredients:complete?ingredients:null};
}
