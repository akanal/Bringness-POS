import {validDay} from './ai-planning-core.js';
const round=n=>Math.round(n*1000)/1000;
const median=a=>{const x=a.slice().sort((a,b)=>a-b);return x.length?(x[Math.floor((x.length-1)/2)]+x[Math.ceil((x.length-1)/2)])/2:null;};
export function wasteRecommendations(stock,lots,recipes,today){
 if(!validDay(today))throw Error('Invalid assistant date');
 const findings=[],eligible=new Set();
 for(const s of stock){const free=Math.max(0,Number(s.quantity)-Number(s.reserved_quantity||0)),batches=lots.filter(b=>b.stock_id===s.id&&Number(b.quantity)>0),sum=batches.reduce((n,b)=>n+Number(b.quantity),0);if(free<=0)continue;
  if(!batches.length){findings.push({stockId:s.id,name:s.name,kind:'missing',message:'Haltbarkeits- und Anbruchdaten fehlen.'});continue;}
  let allCurrent=true;for(const b of batches){const end=[b.expires_on,b.opened_on?b.opened_expires_on:null].filter(Boolean).sort()[0];const stale=String(b.movement_at_check||0)!==String(s.movement_id||0)||Number(b.stock_at_check)!==Number(s.quantity)||b.checked_on!==today||sum>Number(s.quantity);const missing=!b.expires_on||!['sealed','opened'].includes(b.opening_state)||b.opening_state==='opened'&&(!b.opened_on||!b.opened_expires_on);
   if(stale||missing||end<today)allCurrent=false;
   const kind=stale?'recheck':missing?'missing':end<today?'expired':end<=new Date(Date.parse(today+'T12:00:00Z')+2*86400000).toISOString().slice(0,10)?'soon':'dated';
   if(kind!=='dated')findings.push({stockId:s.id,name:s.name,lotId:b.id,label:b.label,quantity:Math.min(Number(b.quantity),free),unit:s.unit,kind,expiresOn:end||null,message:{recheck:'Chargenmenge und Zustand erneut prüfen; Bestand oder Prüftag hat sich geändert.',missing:'Haltbarkeit oder Anbruchzustand ist unvollständig.',expired:'Hinterlegtes Datum überschritten; keine Gerichtsempfehlung.',soon:'Hinterlegtes Datum bald erreicht; vor Verwendung Zustand und Kennzeichnung prüfen.'}[kind]});
  }
  if(allCurrent&&sum>=free)eligible.add(s.id);
 }
 const urgent=new Set(findings.filter(f=>f.kind==='soon').map(f=>f.stockId));
 const dishes=recipes.filter(r=>r.active&&r.items?.length&&r.items.every(i=>eligible.has(i.stock_id))&&r.items.some(i=>urgent.has(i.stock_id))).map(r=>({recipeId:r.id,name:r.name,stockIds:r.items.map(i=>i.stock_id),message:'Rezeptidee für zeitnah zu prüfende Zutaten; keine Freigabe zur Verwendung.'}));
 return {findings,dishes};
}
export function preparationRecommendations(forecasts,history,recipes){
 return forecasts.map(f=>{if(!f.ready||f.closed)return {date:f.date,available:false,message:f.closed?'Als geschlossen hinterlegt.':'Noch zu wenige Vergleichstage.',items:[]};
  const selected=history.filter(d=>d.quality==='sales'&&f.comparisonDates.includes(d.day)),actualOrders=median(selected.map(d=>Number(d.orders))),factor=actualOrders>0?Math.max(.25,Math.min(4,f.expectedOrders/actualOrders)):null;
  if(selected.length<3||factor===null)return {date:f.date,available:false,message:'Mindestens drei archivierte Verkaufstage mit Artikelmengen erforderlich.',items:[]};
  const items=recipes.filter(r=>r.active).map(r=>{const daily=selected.map(d=>(d.products||[]).filter(p=>p.product_code===r.external_code).reduce((n,p)=>n+Number(p.quantity),0)),portionEstimate=median(daily)*factor;
   const hasHours=selected.every(d=>(d.products||[]).filter(p=>p.product_code===r.external_code).every(p=>Number.isInteger(p.hour)&&p.hour>=0&&p.hour<=23));
   const midday=hasHours?median(selected.map(d=>(d.products||[]).filter(p=>p.product_code===r.external_code&&p.hour<17).reduce((n,p)=>n+Number(p.quantity),0)))*factor:null;
   const total=Math.ceil(portionEstimate),before17=midday===null?null:Math.min(total,Math.round(midday));
   return {recipeId:r.id,name:r.name,portions:total,before17,from17:before17===null?null:total-before17,ingredients:r.items.map(i=>({stockId:i.stock_id,quantity:round(total*Number(i.quantity))}))};
  }).filter(i=>i.portions>0);
  return {date:f.date,available:true,sampleDays:selected.length,factor,items,message:'Volle Tagesmengen aus verkauften Artikeln und aktuellen Rezepten. Zeitaufteilung nach Zahlungszeit vor/ab 17 Uhr, keine bestätigten Küchenzeiten oder Reservierungsdaten. Keine automatische Lagerbuchung.'};
 });
}
