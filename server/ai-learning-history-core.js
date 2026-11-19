import {validDay} from './ai-planning-core.js';
import {hash} from './ai-policy.js';
const dayNumber=d=>Date.parse(d+'T12:00:00Z')/86400000;
export const shiftDay=(day,n)=>{if(!validDay(day)||!Number.isInteger(n))throw Error('Invalid history date');return new Date((dayNumber(day)+n)*86400000).toISOString().slice(0,10);};
export function historySourceKey(links){
 const values=[...new Set(links.map(l=>[l.pos_company_id,l.pos_restaurant_id,l.pos_user_id].join(':')))].sort();
 if(!values.length)throw Error('Learning history requires authorized POS sources');return hash(JSON.stringify(values));
}
const median=a=>{const v=a.slice().sort((a,b)=>a-b);return v.length?(v[Math.floor((v.length-1)/2)]+v[Math.ceil((v.length-1)/2)])/2:null;};
function weightedMedian(rows,key){const values=rows.filter(r=>Number.isFinite(r[key])).slice().sort((a,b)=>a[key]-b[key]);const sum=values.reduce((s,r)=>s+r.weight,0);let n=0;for(const r of values){n+=r.weight;if(n>=sum/2)return r[key];}return null;}
export function multiYearPattern(days,target,{comparisonFrom=''}={}){
 if(!validDay(target)||comparisonFrom&&!validDay(comparisonFrom))throw Error('Invalid learning comparison date');
 const weekday=new Date(target+'T12:00:00Z').getUTCDay(),year=Number(target.slice(0,4)),unique=new Map();
 for(const d of Array.isArray(days)?days:[]){if(!d||!validDay(d.day)||d.day>=target||comparisonFrom&&d.day<comparisonFrom||!Number.isSafeInteger(d.orders)||d.orders<=0||!Number.isSafeInteger(d.revenueCents)||d.quality!=='sales')continue;unique.set(d.day,d);}
 const history=[...unique.values()].sort((a,b)=>b.day.localeCompare(a.day)),recent=[],seasonal=[];
 for(const d of history){if(new Date(d.day+'T12:00:00Z').getUTCDay()!==weekday)continue;const age=dayNumber(target)-dayNumber(d.day),years=Math.round(age/365.2425);
  if(age<=56)recent.push({...d,weight:1,kind:'recent'});
  else if(years>=1){const anniversary=String(year-years)+target.slice(4),anchor=validDay(anniversary)?anniversary:anniversary.slice(0,5)+'02-28';if(Math.abs(dayNumber(d.day)-dayNumber(anchor))<=21)seasonal.push({...d,weight:1/(1+years*.35),kind:'seasonal'});}
 }
 let selected=[...recent.slice(0,8),...seasonal],fallback=false;
 if(selected.length<3){selected=history.filter(d=>dayNumber(target)-dayNumber(d.day)<=28).slice(0,14).map(d=>({...d,weight:1,kind:'fallback'}));fallback=true;}
 // Old seasons cannot dominate solely because more years are present.
 const rWeight=selected.filter(d=>d.kind==='recent').reduce((s,d)=>s+d.weight,0),sWeight=selected.filter(d=>d.kind==='seasonal').reduce((s,d)=>s+d.weight,0);
 if(rWeight&&sWeight>rWeight)selected=selected.map(d=>d.kind==='seasonal'?{...d,weight:d.weight*rWeight/sWeight}:d);
 const ready=selected.length>=3,baseOrders=weightedMedian(selected,'orders'),revenueDays=(recent.length>=3?recent.slice(0,8):selected).filter(d=>d.revenueCents>=0),baseRevenueCents=weightedMedian(revenueDays,'revenueCents');
 const orderSpread=ready?median(selected.map(d=>Math.abs(d.orders-baseOrders))):null;
 return {ready,sampleDays:selected.length,comparisonDates:selected.map(d=>d.day),fallback,baseOrders,baseRevenueCents,orderSpread,seasonalDays:selected.filter(d=>d.kind==='seasonal').length,seasonalYears:[...new Set(selected.filter(d=>d.kind==='seasonal').map(d=>d.day.slice(0,4)))].sort(),availableYears:[...new Set(history.map(d=>d.day.slice(0,4)))].sort(),earliestDay:history.at(-1)?.day||null,latestDay:history[0]?.day||null,historyDays:history.length,revenueBasis:recent.length>=3?'recent':'historical_nominal',comparisonFrom:comparisonFrom||null};
}
export function applyMultiYearPattern(forecast,pattern){
 if(!pattern.ready)return {...forecast,multiYear:pattern};
 const orders=Math.max(forecast.currentOrders,Math.round(pattern.baseOrders*forecast.pace));
 // Revenue keeps its separate nominal-value history; never infer portions from price changes.
 const revenue=pattern.baseRevenueCents===null?forecast.expectedRevenueCents:Math.max(forecast.currentRevenueCents,Math.round(pattern.baseRevenueCents*forecast.pace));
 const band=(n,current,spread=0)=>({low:Math.max(current,Math.floor(n-Math.max(n*.25,spread*1.5))),high:Math.max(current,Math.ceil(n+Math.max(n*.25,spread*1.5)))});
 return {...forecast,ready:true,outlook:forecast.ready?forecast.outlook:'Mehrjähriger Vergleich',sampleDays:pattern.sampleDays,comparisonDates:pattern.comparisonDates,fallback:pattern.fallback,seasonalDays:pattern.seasonalDays,expectedOrders:orders,expectedRevenueCents:revenue,ordersBand:band(orders,forecast.currentOrders,pattern.orderSpread),revenueBand:revenue===null?null:band(revenue,forecast.currentRevenueCents),confidence:pattern.sampleDays<6?'Dünne mehrjährige Datenbasis':'Mehrjähriger Mustervergleich; grobe Orientierung',multiYear:pattern};
}
