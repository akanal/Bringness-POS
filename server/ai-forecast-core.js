// Deliberately approximate, explainable forecasts; no external service or auto-order.
export function berlinClock(now=new Date()) {
 const parts=Object.fromEntries(new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(now).map(p=>[p.type,p.value]));
 return {date:`${parts.year}-${parts.month}-${parts.day}`,hour:Number(parts.hour)};
}
const dayNumber=date=>Date.parse(date+'T12:00:00Z')/86400000;
const weekday=date=>new Date(date+'T12:00:00Z').getUTCDay();
const median=values=>{const a=[...values].sort((x,y)=>x-y);return a.length?(a[Math.floor((a.length-1)/2)]+a[Math.ceil((a.length-1)/2)])/2:0};
export function approximateDay(rows,clock=berlinClock()) {
 const daily=new Map();
 for(const row of rows){const date=String(row.day).slice(0,10);if(date>clock.date)continue;let d=daily.get(date);if(!d){d={date,orders:0,revenueCents:0,hours:[]};daily.set(date,d)}const hour=Number(row.hour),orders=Number(row.orders),revenue=Number(row.revenue_cents);d.orders+=orders;d.revenueCents+=revenue;d.hours.push({hour,orders,revenueCents:revenue});}
 const past=[...daily.values()].filter(d=>d.date<clock.date).sort((a,b)=>b.date.localeCompare(a.date));
 const same=past.filter(d=>weekday(d.date)===weekday(clock.date));
 const recent=same.filter(d=>dayNumber(clock.date)-dayNumber(d.date)<=56).slice(0,8);
 // 364 days preserves weekday; seasonal data is a separate comparison, not a copied forecast.
 const seasonal=same.filter(d=>Math.abs(dayNumber(clock.date)-dayNumber(d.date)-364)<=14);
 let samples=[...new Map([...recent,...seasonal].map(d=>[d.date,d])).values()];let fallback=false;
 if(samples.length<3){samples=past.filter(d=>dayNumber(clock.date)-dayNumber(d.date)<=28).slice(0,14);fallback=true;}
 const today=daily.get(clock.date)||{date:clock.date,orders:0,revenueCents:0,hours:[]};
 const currentOrders=today.hours.filter(h=>h.hour<=clock.hour).reduce((s,h)=>s+h.orders,0),currentRevenue=today.hours.filter(h=>h.hour<=clock.hour).reduce((s,h)=>s+h.revenueCents,0);
 const ready=samples.length>=3;
 const baseOrders=median(samples.map(d=>d.orders)),baseRevenue=median(samples.map(d=>d.revenueCents));
 // Compare completed hours only. Partial current hour does not inflate today's pace.
 const completed=today.hours.filter(h=>h.hour<clock.hour).reduce((s,h)=>s+h.orders,0);
 const expectedCompleted=median(samples.map(d=>d.hours.filter(h=>h.hour<clock.hour).reduce((s,h)=>s+h.orders,0)));
 const progress=baseOrders?expectedCompleted/baseOrders:0;
 const pace=ready&&progress>=0.2&&expectedCompleted>0?Math.max(0.5,Math.min(2,completed/expectedCompleted)):1;
 const ratio=ready&&progress>=0.2?completed/expectedCompleted:null;
 const estimate=(base,current)=>Math.max(current,Math.round(base*pace));
 const orders=estimate(baseOrders,currentOrders),revenue=estimate(baseRevenue,currentRevenue);
 const band=(values,current,estimate)=>{const spread=median(values.map(v=>Math.abs(v-median(values))));const margin=Math.max(estimate*0.25,spread*1.5);return {low:Math.max(current,Math.floor(estimate-margin)),high:Math.max(current,Math.ceil(estimate+margin))}};
 return {date:clock.date,hour:clock.hour,timezone:'Europe/Berlin',ready,sampleDays:samples.length,comparisonDates:samples.map(d=>d.date),fallback,seasonalDays:seasonal.length,currentOrders,currentRevenueCents:currentRevenue,
  outlook:!ready?'Zu wenig Daten':ratio===null?'Noch offen':ratio<0.8?'Eher ruhig':ratio>1.2?'Eher stark':'Üblich',
  expectedOrders:ready?orders:null,ordersBand:ready?band(samples.map(d=>d.orders),currentOrders,orders):null,
  expectedRevenueCents:ready?revenue:null,revenueBand:ready?band(samples.map(d=>d.revenueCents),currentRevenue,revenue):null,
  confidence:!ready?'Noch keine belastbare Schätzung':samples.length<6||fallback?'Dünne Datenbasis':'Grobe Orientierung',
  history:past.slice(0,400).map(({hours,...d})=>d),pace,progress};
}
