import {berlinClock} from './ai-forecast-core.js';
import {validDay} from './ai-planning-core.js';

const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const features=['warm','rain','events'];
const contextKey=value=>value&&typeof value==='object'&&!Array.isArray(value)?JSON.stringify(Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)))):'';
export function forecastObservation(context,date){
 const rules=context.settings.demandRules,weather=context.weather?.available?context.weather.days?.filter(w=>w.date===date):[];
 const w=weather?.length===1&&weather[0].partial===false?weather[0]:null;
 const events=context.events.filter(e=>e.status==='active'&&(!e.public||context.settings.publicEventDemand)&&Number.isFinite(Date.parse(e.starts_at))&&Number.isFinite(Date.parse(e.ends_at))&&berlinClock(new Date(e.starts_at)).date<=date&&berlinClock(new Date(Date.parse(e.ends_at)-1)).date>=date);
 return {warm:w&&Number.isFinite(w.maxC)?w.maxC>=rules.warmC:null,rain:w&&Number.isFinite(w.rainMm)?w.rainMm>=rules.rainMm:null,events:events.length?true:context.settings.publicEventDemand&&(!context.publicEvents?.available||context.publicEvents?.partial)?null:false,thresholds:{warmC:rules.warmC,rainMm:rules.rainMm,publicEventDemand:context.settings.publicEventDemand===true,latitude:context.settings.latitude??null,longitude:context.settings.longitude??null,radiusKm:context.settings.radiusKm??null,weatherStation:context.settings.weatherStation||''}};
}
function fit(rows,active){
 // Small ridge regression on log residuals of frozen, pre-sales forecasts.
 // The intercept and coefficients are predictive associations, not causal effects.
 const size=4,a=Array.from({length:size},()=>Array(size+1).fill(0));
 for(const r of rows){const x=[1,...features.map((k,i)=>active[i]&&r.observation[k]?1:0)],y=clamp(Math.log((r.actual+1)/(r.baseline+1)),-Math.log(2),Math.log(2));for(let i=0;i<size;i++){for(let j=0;j<size;j++)a[i][j]+=x[i]*x[j];a[i][size]+=x[i]*y;}}
 for(let i=0;i<size;i++)a[i][i]+=4;
 for(let i=0;i<size;i++){let pivot=i;for(let j=i+1;j<size;j++)if(Math.abs(a[j][i])>Math.abs(a[pivot][i]))pivot=j;[a[i],a[pivot]]=[a[pivot],a[i]];const n=a[i][i];for(let k=i;k<=size;k++)a[i][k]/=n;for(let j=0;j<size;j++)if(j!==i){const factor=a[j][i];for(let k=i;k<=size;k++)a[j][k]-=factor*a[i][k];}}
 return a.map(r=>r[size]);
}
const factor=(coefficients,observation)=>clamp(Math.exp(coefficients[0]+features.reduce((s,k,i)=>s+(observation[k]===true?coefficients[i+1]:0),0)),0.75,1.25);
export function learnForecast(samples,observation,today,{requireKnowledgeTime=false,comparisonFrom=''}={}){
 if(!validDay(today))throw Error('Invalid learning date');
 const unique=new Map(),thresholds=contextKey(observation?.thresholds);
 for(const s of Array.isArray(samples)?samples:[]){
  if(!s||!validDay(s.day)||s.day>=today||comparisonFrom&&s.day<comparisonFrom||!Number.isInteger(s.hour)||s.hour<0||s.hour>9||s.currentOrders!==0||!Number.isSafeInteger(s.baseline)||s.baseline<5||!Number.isSafeInteger(s.actual)||s.actual<0||s.actual>10000000||features.some(k=>typeof s.observation?.[k]!=='boolean')||contextKey(s.observation.thresholds)!==thresholds)continue;
  if(requireKnowledgeTime&&(!Number.isFinite(Date.parse(s.capturedAt))||!Number.isFinite(Date.parse(s.actualKnownAt))||s.capturedAt>=s.actualKnownAt))continue;
  const old=unique.get(s.day);if(!old||s.hour<old.hour)unique.set(s.day,s);
 }
 const rows=[...unique.values()].sort((a,b)=>a.day.localeCompare(b.day));
 const base={available:false,applied:false,factor:1,sampleDays:rows.length,requiredDays:42,method:'Chronologischer Lernvergleich mit zurückgehaltenen Tagen; statistische Zusammenhänge, keine Kausalitätsaussage.'};
 if(rows.length<42)return {...base,message:'Lernvergleich sammelt abgeschlossene Tage mit früher Prognose und vollständigem Wetter.'};
 const split=Math.floor(rows.length*2/3),validation=rows.slice(split),cutoff=Date.parse(validation[0].capturedAt),train=rows.slice(0,split).filter(r=>!requireKnowledgeTime||Date.parse(r.actualKnownAt)<=cutoff);
 if(train.length<28||validation.length<14)return {...base,trainingDays:train.length,message:'Noch zu wenige Lerntage waren vor Beginn der getrennten Prüfung bekannt.'};
 const active=features.map(k=>train.filter(r=>r.observation[k]).length>=8&&train.filter(r=>!r.observation[k]).length>=8);
 const coefficients=fit(train,active);
 const error=(subset,learned)=>subset.reduce((s,r)=>s+Math.abs(r.actual-Math.round(r.baseline*(learned?factor(coefficients,r.observation):1))),0)/subset.length;
 const baselineMae=error(validation,false),learnedMae=error(validation,true),recent=validation.slice(Math.floor(validation.length/2));
 const improvement=baselineMae>0?(baselineMae-learnedMae)/baselineMae:0;
 const evidence={trainingDays:train.length,validationDays:validation.length,trainedThrough:train.at(-1).day,validatedThrough:validation.at(-1).day,baselineMae,learnedMae,improvementPercent:Math.round(improvement*1000)/10,learnedFeatures:features.filter((_,i)=>active[i])};
 if(improvement<0.05||error(recent,true)>error(recent,false))return {...base,...evidence,message:'Gelernte Korrektur verbessert den bisherigen Vergleich noch nicht zuverlässig.'};
 if(features.some((k,i)=>active[i]&&typeof observation?.[k]!=='boolean'))return {...base,...evidence,message:'Für die gelernte Korrektur fehlen aktuelle Wetter- oder Termindaten.'};
 return {...base,...evidence,available:true,coefficients,factor:factor(coefficients,observation),message:'Gelernte Korrektur im historischen Vergleich besser; begrenzt auf ±25 %.'};
}
export function applyLearnedForecast(forecast,learning,enabled){
 if(!forecast.ready||!enabled||!learning.available)return {...forecast,learning:{...learning,applied:false}};
 const target=learning.factor,current=Number.isFinite(forecast.demand?.rawFactor)?forecast.demand.rawFactor:1;
 // Learned residual replaces scenario coefficients; never stack both effects.
 const progress=clamp(forecast.progress||0,0,1),learnedFactor=1+(target-1)*(1-progress),existing=1+(current-1)*(1-progress),ratio=learnedFactor/existing;
 const orders=Math.max(forecast.currentOrders,Math.round(forecast.expectedOrders*ratio)),revenue=Math.max(forecast.currentRevenueCents,Math.round(forecast.expectedRevenueCents*ratio));
 const band=(b,actual,estimate)=>b?{low:Math.min(estimate,Math.max(actual,Math.floor(b.low*ratio))),high:Math.max(estimate,actual,Math.ceil(b.high*ratio))}:null;
 return {...forecast,pace:forecast.pace*ratio,expectedOrders:orders,expectedRevenueCents:revenue,ordersBand:band(forecast.ordersBand,forecast.currentOrders,orders),revenueBand:band(forecast.revenueBand,forecast.currentRevenueCents,revenue),learning:{...learning,applied:true,appliedFactor:learnedFactor}};
}
