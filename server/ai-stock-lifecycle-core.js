const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status})};
export function stockUnits(value){
  const n=Number(value);
  if(value===null||value===''||typeof value==='boolean'||!Number.isFinite(n)||n<0||n>1000000000||Math.abs(n*1000-Math.round(n*1000))>0.00001)fail('Ungültige Menge (höchstens drei Nachkommastellen)');
  return Math.round(n*1000);
}
export function replenishment(stock,{incoming=0,pending=0}={}){
  const physical=Number(stock.quantity),reserved=Number(stock.reserved_quantity||0),available=Math.max(0,physical-reserved);
  const minimum=Number(stock.minimum),target=Number(stock.target_quantity??minimum);
  return {available,low:available<=minimum,target,shortage:Math.ceil(Math.max(0,target-available-Number(incoming)-Number(pending))*1000)/1000};
}
export function lifecycleTransition(state,action){
  const next={accepted:{start:'preparing',cancel:'cancelled'},preparing:{cancel:'cancelled',return:'preparing'},cancelled:{return:'cancelled'}}[state]?.[action];
  if(!next)fail('Aktion für diesen Bestellstatus nicht möglich',409);
  return next;
}
export function aggregateIngredients(lines){
  const totals=new Map();
  for(const line of lines){const units=Math.ceil(Number(line.quantity)*Number(line.portions)*1000-1e-8);if(!Number.isSafeInteger(units)||units<1||units>1000000000000)fail('Verbrauchsmenge ungültig');totals.set(line.stockId,(totals.get(line.stockId)||0)+units)}
  return [...totals].sort(([a],[b])=>a.localeCompare(b)).map(([stockId,units])=>({stockId,quantity:units/1000}));
}
export function validateStockTargets(minimum,target){const min=stockUnits(minimum),max=stockUnits(target);if(max<min)fail('Zielbestand darf nicht unter dem Mindestbestand liegen');return {minimum:min/1000,target:max/1000}}
