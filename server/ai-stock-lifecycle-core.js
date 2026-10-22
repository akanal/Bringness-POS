const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status})};
export function stockUnits(value){
  if(typeof value!=='number'&&(typeof value!=='string'||!/^\d+(?:\.\d{1,3})?$/.test(value)))fail('Ungültige Menge');
  const n=Number(value);
  if(value===null||value===''||typeof value==='boolean'||!Number.isFinite(n)||n<0||n>1000000000||Math.abs(n*1000-Math.round(n*1000))>0.00001)fail('Ungültige Menge (höchstens drei Nachkommastellen)');
  return Math.round(n*1000);
}
// Physical stock may be negative after a historical sale; precision limits still apply.
export function signedStockUnits(value){
 if(typeof value==='string'&&value.startsWith('-'))return -stockUnits(value.slice(1));
 if(typeof value==='number'&&value<0)return -stockUnits(-value);
 return stockUnits(value);
}
export function replenishment(stock,{incoming=0,pending=0}={}){
  const values=[stock?.quantity,stock?.reserved_quantity??0,stock?.minimum,stock?.target_quantity??stock?.minimum,incoming,pending];
  if(values.some((v,i)=>(typeof v!=='number'&&typeof v!=='string')||String(v).trim()===''||!Number.isFinite(Number(v))||(i!==0&&Number(v)<0)||!Number.isSafeInteger(Math.round(Number(v)*1000))))fail('Ungültige Bestandsgrundlage');
  // Validate decimal precision before calculating procurement amounts.
  for(const value of values.slice(1))stockUnits(value);
  const rawPhysical=stock.quantity;
  stockUnits(typeof rawPhysical==='string'&&rawPhysical.startsWith('-')?rawPhysical.slice(1):Math.abs(Number(rawPhysical)));
  if(typeof rawPhysical==='string'&&!/^-?\d+(?:\.\d{1,3})?$/.test(rawPhysical))fail('Ungültige Bestandsgrundlage');
  const physicalUnits=Math.round(Number(rawPhysical)*1000),reservedUnits=stockUnits(stock.reserved_quantity??0),availableUnits=Math.max(0,physicalUnits-reservedUnits),available=availableUnits/1000;
  const minimum=Number(stock.minimum),target=Number(stock.target_quantity??minimum);
  if(target<minimum)fail('Zielbestand darf nicht unter dem Mindestbestand liegen');
  return {available,low:available<=minimum,target,shortage:Math.max(0,stockUnits(target)-availableUnits-stockUnits(incoming)-stockUnits(pending))/1000};
}
export function lifecycleTransition(state,action){
  const transitions={accepted:{start:'preparing',cancel:'cancelled'},preparing:{cancel:'cancelled',return:'preparing'},cancelled:{return:'cancelled'}};
  const actions=typeof state==='string'&&Object.hasOwn(transitions,state)?transitions[state]:null;
  const next=actions&&typeof action==='string'&&Object.hasOwn(actions,action)?actions[action]:null;
  if(!next)fail('Aktion für diesen Bestellstatus nicht möglich',409);
  return next;
}
export function aggregateIngredients(lines){
  if(!Array.isArray(lines)||lines.length>10000)fail('Ungültige Verbrauchspositionen');
  const totals=new Map();
  for(const line of lines){if(!line||typeof line.stockId!=='string'||!line.stockId||[line.quantity,line.portions].some(v=>(typeof v!=='number'&&typeof v!=='string')||String(v).trim()===''||!Number.isFinite(Number(v))||Number(v)<=0))fail('Ungültige Verbrauchsposition');const quantityUnits=BigInt(stockUnits(line.quantity)),portionUnits=BigInt(stockUnits(line.portions));const units=Number((quantityUnits*portionUnits+999n)/1000n);if(!Number.isSafeInteger(units)||units<1||units>1000000000000)fail('Verbrauchsmenge ungültig');const sum=(totals.get(line.stockId)||0)+units;if(!Number.isSafeInteger(sum)||sum>1000000000000)fail('Gesamte Verbrauchsmenge zu groß');totals.set(line.stockId,sum)}
  return [...totals].sort(([a],[b])=>a.localeCompare(b)).map(([stockId,units])=>({stockId,quantity:units/1000}));
}
export function validateStockTargets(minimum,target){const min=stockUnits(minimum),max=stockUnits(target);if(max<min)fail('Zielbestand darf nicht unter dem Mindestbestand liegen');return {minimum:min/1000,target:max/1000}}

export function reserveStock(stock,amount){
 const physical=signedStockUnits(stock.quantity),reserved=stockUnits(stock.reserved_quantity),needed=stockUnits(amount);
 if(needed<=0||physical-reserved<needed)fail('Nicht genügend freie Zutaten',409);
 if(reserved+needed>1000000000000)fail('Reservierte Menge zu hoch',409);
 return {reserved:(reserved+needed)/1000};
}

export function releaseReservedStock(stock,amount,action){
 if(!['start','cancel'].includes(action))fail('Ungültige Reservierungsaktion',409);
 const physical=signedStockUnits(stock.quantity),reserved=stockUnits(stock.reserved_quantity),needed=stockUnits(amount);
 if(needed<=0||reserved<needed)fail('Reservierung inkonsistent',409);
 if(action==='start'&&physical<needed)fail('Tatsächlicher Bestand reicht nicht',409);
 return {reserved:(reserved-needed)/1000,before:physical/1000,quantity:(physical-(action==='start'?needed:0))/1000,consumed:action==='start'?needed/1000:0};
}

export function returnConsumedStock(stock,consumed,returned,amount){
 const physical=signedStockUnits(stock.quantity),used=stockUnits(consumed),previous=stockUnits(returned),units=stockUnits(amount);
 if(units<=0||previous>used||units>used-previous)fail('Rückbuchung übersteigt den verbleibenden Verbrauch',409);
 if(physical+units>1000000000000)fail('Bestand nach Rückbuchung zu hoch',409);
 return {before:physical/1000,quantity:(physical+units)/1000,returned:(previous+units)/1000,delta:units/1000};
}

// Derived forecasts may contain fractions finer than stored stock units.
export function roundPlannedStockUp(value){
 if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>1000000000)fail('Ungültiger berechneter Zielbestand');
 const scaled=value*1000,nearest=Math.round(scaled);
 const stable=Math.abs(scaled-nearest)<=Number.EPSILON*Math.max(1,scaled)?nearest:scaled;
 return Math.ceil(stable)/1000;
}

// Sales retain their historical nearest-unit policy; negative half units round toward zero.
export function aggregateSaleIngredients(lines){
 if(!Array.isArray(lines)||!lines.length||lines.length>10000)fail('Ungültige Verbrauchspositionen');
 const totals=new Map();
 for(const line of lines){
  if(!line||typeof line.stockId!=='string'||!line.stockId)fail('Ungültige Verbrauchsposition');
  const quantity=stockUnits(line.quantity),portions=stockUnits(line.portions);
  if(quantity<=0||portions<=0)fail('Positive Verbrauchsmenge erforderlich');
  const numerator=BigInt(quantity)*BigInt(portions)+(totals.get(line.stockId)||0n);
  if(numerator>1000000000000000n)fail('Gesamte Verbrauchsmenge zu groß');
  totals.set(line.stockId,numerator);
 }
 return [...totals].sort(([a],[b])=>a.localeCompare(b)).map(([stockId,numerator])=>{
  const units=Number((numerator+499n)/1000n);
  return {stockId,delta:units===0?0:-units/1000};
 });
}
export function applyStockDelta(quantity,delta){
 const before=signedStockUnits(quantity),change=signedStockUnits(delta),after=before+change;
 if(Math.abs(after)>1000000000000)fail('Bestand nach Lagerbuchung außerhalb der Mengengrenze',409);
 return after/1000;
}
