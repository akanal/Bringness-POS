import {berlinClock} from './ai-forecast-core.js';
export function demandRules(value={}){
 if(value===null||typeof value!=='object'||Array.isArray(value))throw Error('Ungültige Prognoseregeln');
 const defaults={enabled:false,warmC:25,rainMm:5,warmPercent:0,rainPercent:0,eventPercent:0};
 const r={...defaults,...value};if(typeof r.enabled!=='boolean')throw Error('Prognoseregeln ausdrücklich aktivieren');
 for(const [key,min,max]of [['warmC',-20,50],['rainMm',0.1,100],['warmPercent',-50,50],['rainPercent',-50,50],['eventPercent',-50,50]])if(typeof r[key]!=='number'||!Number.isFinite(r[key])||r[key]<min||r[key]>max)throw Error('Ungültige Prognoseregel: '+key);
 return Object.fromEntries(Object.keys(defaults).map(k=>[k,r[k]]));
}
export function applyDemandContext(forecast,context){
 const rules=demandRules(context.settings.demandRules||{}),adjustments=[];
 const result={...forecast};if(!rules.enabled||!forecast.ready||context.closedToday){result.demand={enabled:rules.enabled,factor:1,adjustments};return result}
 const weather=context.weather?.available&&context.weather.days?.find(d=>d.date===forecast.date);
 if(weather&&!weather.partial){if(Number.isFinite(weather.maxC)&&weather.maxC>=rules.warmC&&rules.warmPercent)adjustments.push({kind:'warm',percent:rules.warmPercent,source:context.weather.stationId,issuedAt:context.weather.issuedAt});if(Number.isFinite(weather.rainMm)&&weather.rainMm>=rules.rainMm&&rules.rainPercent)adjustments.push({kind:'rain',percent:rules.rainPercent,source:context.weather.stationId,issuedAt:context.weather.issuedAt})}
 const events=(context.events||[]).filter(e=>e.status==='active'&&berlinClock(new Date(e.starts_at)).date<=forecast.date&&berlinClock(new Date(e.ends_at)).date>=forecast.date);
 if(events.length&&rules.eventPercent)adjustments.push({kind:'events',percent:rules.eventPercent,events:events.map(e=>({id:e.id,version:e.version}))});
 const rawFactor=Math.max(0.5,Math.min(1.5,1+adjustments.reduce((s,a)=>s+a.percent,0)/100));
 // Fade configured context as real sales become the stronger source of evidence.
 const factor=1+(rawFactor-1)*(1-Math.max(0,Math.min(1,forecast.progress||0)));
 result.pace=forecast.pace*factor;result.expectedOrders=Math.max(forecast.currentOrders,Math.round(forecast.expectedOrders*factor));result.expectedRevenueCents=Math.max(forecast.currentRevenueCents,Math.round(forecast.expectedRevenueCents*factor));
 const band=(b,current,estimate)=>b?{low:Math.min(estimate,Math.max(current,Math.floor(b.low*factor))),high:Math.max(estimate,current,Math.ceil(b.high*factor))}:null;
 result.ordersBand=band(forecast.ordersBand,forecast.currentOrders,result.expectedOrders);result.revenueBand=band(forecast.revenueBand,forecast.currentRevenueCents,result.expectedRevenueCents);
 result.demand={enabled:true,factor,rawFactor,adjustments,rules,weatherSkipped:!weather||weather.partial,method:'Betrieblich konfigurierte Szenarioregeln, keine gelernte Wetterwirkung'};return result;
}
