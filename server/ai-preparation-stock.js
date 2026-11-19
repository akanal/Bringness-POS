import {validDay} from './ai-planning-core.js';

// Read-only planning in thousandths of the stock unit. Supplies are consumed once
// across the dated plan; shortages never create imaginary stock on later days.
export function preparationStockPlan(days,stocks,deliveries,today){
 if(!validDay(today))throw Error('Invalid planning date');
 const units=n=>{if(n===null||n===''||!Number.isFinite(Number(n))||Number(n)<0||!Number.isSafeInteger(Math.round(Number(n)*1000)))return null;return Math.round(Number(n)*1000)};
 const stock=new Map(stocks.map(s=>[s.id,s])),remaining=new Map(),seen=new Set();
 for(const s of stocks){const quantity=units(s.quantity),reserved=units(s.reserved_quantity??0);remaining.set(s.id,quantity===null||reserved===null?null:Math.max(0,quantity-reserved));}
 const arrivals=deliveries.filter(d=>stock.has(d.stockId)&&validDay(d.date)&&d.date>=today&&units(d.quantity)!==null).sort((a,b)=>a.date.localeCompare(b.date));
 let deliveryIndex=0,blocked=false;
 return days.slice().sort((a,b)=>String(a.date).localeCompare(String(b.date))).map(day=>{
  if(!validDay(day.date)||day.date<today||seen.has(day.date))throw Error('Invalid or duplicate preparation day');seen.add(day.date);
  // An unknown demand day breaks the running allocation. A known closed day
  // is explicitly distinguished by the route and may safely have zero demand.
  if(!day.available&&!day.closed)blocked=true;
  if(blocked)return {date:day.date,available:false,items:[],message:'Bedarfsdaten fehlen in diesem oder einem früheren Planungstag. Keine Bestandsdeckung berechnet.'};
  const received=new Map();
  while(deliveryIndex<arrivals.length&&arrivals[deliveryIndex].date<=day.date){const d=arrivals[deliveryIndex++],q=units(d.quantity);received.set(d.stockId,(received.get(d.stockId)||0)+q);if(remaining.get(d.stockId)!==null)remaining.set(d.stockId,remaining.get(d.stockId)+q);}
  const needs=new Map();
  for(const recipe of day.items||[])for(const ingredient of recipe.ingredients||[]){const q=units(ingredient.quantity);if(q===null)throw Error('Invalid ingredient quantity');needs.set(ingredient.stockId,(needs.get(ingredient.stockId)||0)+q);}
  const items=[...needs].map(([stockId,required])=>{const s=stock.get(stockId),available=remaining.get(stockId);if(!s||available===null||available===undefined)return {stockId,name:s?.name||'Nicht zugeordnete Zutat',unit:s?.unit??null,required:required/1000,available:null,incoming:null,shortage:null,remaining:null};
   const shortage=Math.max(0,required-available),left=Math.max(0,available-required);remaining.set(stockId,left);
   return {stockId,name:s.name,unit:s.unit,required:required/1000,available:available/1000,incoming:(received.get(stockId)||0)/1000,shortage:shortage/1000,remaining:left/1000};
  });
  return {date:day.date,available:true,closed:day.closed===true,items,message:'Ganze Tagesmengen; kein verbleibender Bedarf ab jetzt. Bestand abzüglich Reservierungen und bestätigte Lieferungen nach Datum, über die Tage nur einmal angerechnet. Lieferuhrzeiten und Verwendbarkeit nicht bestätigt. Fehlmengen erzeugen keinen Bestand. Keine Bestellung oder Lagerbuchung.'};
 });
}
