import {berlinClock,approximateDay} from './ai-forecast-core.js';
import {closedOn} from './ai-planning-core.js';
export function demandRules(value={}){
 if(value===null||typeof value!=='object'||Array.isArray(value))throw Error('Ungültige Prognoseregeln');
 const defaults={enabled:false,warmC:25,rainMm:5,warmPercent:0,rainPercent:0,eventPercent:0};
 const r={...defaults,...value};if(typeof r.enabled!=='boolean')throw Error('Prognoseregeln ausdrücklich aktivieren');
 for(const [key,min,max]of [['warmC',-20,50],['rainMm',0.1,100],['warmPercent',-50,50],['rainPercent',-50,50],['eventPercent',-50,50]])if(typeof r[key]!=='number'||!Number.isFinite(r[key])||r[key]<min||r[key]>max)throw Error('Ungültige Prognoseregel: '+key);
 return Object.fromEntries(Object.keys(defaults).map(k=>[k,r[k]]));
}
export function applyDemandContext(forecast,context){
 const result={...forecast};if(!forecast.ready||context.closedToday){result.demand={enabled:!!context.settings.demandRules?.enabled,factor:1,adjustments:[]};return result}
 const effect=demandEffect(forecast.date,context,forecast.progress||0),factor=effect.factor;
 result.pace=forecast.pace*factor;result.expectedOrders=Math.max(forecast.currentOrders,Math.round(forecast.expectedOrders*factor));result.expectedRevenueCents=Math.max(forecast.currentRevenueCents,Math.round(forecast.expectedRevenueCents*factor));
 const band=(b,current,estimate)=>b?{low:Math.min(estimate,Math.max(current,Math.floor(b.low*factor))),high:Math.max(estimate,current,Math.ceil(b.high*factor))}:null;
 result.ordersBand=band(forecast.ordersBand,forecast.currentOrders,result.expectedOrders);result.revenueBand=band(forecast.revenueBand,forecast.currentRevenueCents,result.expectedRevenueCents);
 result.demand=effect;return result;
}

export function demandEffect(date,context,progress=0){
 const rules=demandRules(context.settings.demandRules||{}),adjustments=[];
 if(!rules.enabled)return {enabled:false,factor:1,rawFactor:1,adjustments,rules};
 const weather=context.weather?.available&&context.weather.days?.find(d=>d.date===date);
 if(weather&&weather.partial===false){if(Number.isFinite(weather.maxC)&&weather.maxC>=rules.warmC&&rules.warmPercent)adjustments.push({kind:'warm',percent:rules.warmPercent,source:context.weather.stationId,issuedAt:context.weather.issuedAt});if(Number.isFinite(weather.rainMm)&&weather.rainMm>=rules.rainMm&&rules.rainPercent)adjustments.push({kind:'rain',percent:rules.rainPercent,source:context.weather.stationId,issuedAt:context.weather.issuedAt})}
 const events=(context.events||[]).filter(e=>e.status==='active'&&berlinClock(new Date(e.starts_at)).date<=date&&berlinClock(new Date(Date.parse(e.ends_at)-1)).date>=date);
 if(events.length&&rules.eventPercent)adjustments.push({kind:'events',percent:rules.eventPercent,events:events.map(e=>({id:e.id,version:e.version}))});
 const rawFactor=Math.max(0.5,Math.min(1.5,1+adjustments.reduce((s,a)=>s+a.percent,0)/100));
 // Fade configured context as real sales become the stronger source of evidence.
 const factor=1+(rawFactor-1)*(1-Math.max(0,Math.min(1,progress)));
 return {enabled:true,factor,rawFactor,adjustments,rules,weatherSkipped:!weather||weather.partial,method:'Betrieblich konfigurierte Szenarioregeln, keine gelernte Wetterwirkung'};
}
export function planningDemandDays(context,today,days){return Array.from({length:days},(_,i)=>{const date=new Date(Date.parse(today+'T12:00:00Z')+i*86400000).toISOString().slice(0,10),closed=closedOn(date,context.settings),effect=demandEffect(date,context);return {date,closed,factor:closed?0:effect.factor,adjustments:closed?[]:effect.adjustments}})}
export function nextDemandForecasts(rows,context,today,days=6){const history=rows.filter(r=>r.day<today);return Array.from({length:days},(_,i)=>{const date=new Date(Date.parse(today+'T12:00:00Z')+(i+1)*86400000).toISOString().slice(0,10),closed=closedOn(date,context.settings),forecast=applyDemandContext(approximateDay(history,{date,hour:0}),{...context,closedToday:closed});delete forecast.history;if(closed){forecast.ready=false;forecast.expectedOrders=null;forecast.expectedRevenueCents=null;forecast.ordersBand=null;forecast.revenueBand=null;forecast.outlook='Ruhetag'}return {...forecast,closed}})}
