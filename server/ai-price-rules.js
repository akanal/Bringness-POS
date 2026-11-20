const minutes = value => typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)
 ? Number(value.slice(0,2))*60 + Number(value.slice(3)) : null;
const boundedInteger = (value,min,max) => Number.isInteger(value) && value>=min && value<=max;
const invalid = () => {throw Object.assign(Error('Bitte Auslöser und Grenzwerte der AI-Preisaktion prüfen.'),{status:400})};

export function normalizePriceTriggers(value,productIds) {
 if(!value||typeof value!=='object'||Array.isArray(value))invalid();
 return Object.fromEntries(Object.entries(value).map(([id,rule])=>{
  if(!productIds.includes(id)||!rule||typeof rule!=='object')invalid();
  const {kind}=rule;
  if(kind==='expiry')return [id,{kind}];
  if(kind==='quiet'){
   const {start,end,maxOrders}=rule,from=minutes(start),to=minutes(end);
   if(from===null||to===null||from>=to||!boundedInteger(maxOrders,0,1000))invalid();
   return [id,{kind,start,end,maxOrders}];
  }
  if(kind==='surplus'){
   const {portions,beforeClosing}=rule;
   if(!boundedInteger(portions,1,10000)||!boundedInteger(beforeClosing,15,180))invalid();
   return [id,{kind,portions,beforeClosing}];
  }
  if(kind==='forecast'){
   if(!boundedInteger(rule.belowPercent,5,90))invalid();
   return [id,{kind,belowPercent:rule.belowPercent}];
  }
  if(kind==='menu'){
   if(!boundedInteger(rule.portions,1,10000))invalid();
   if(rule.offerCents!==undefined&&!boundedInteger(rule.offerCents,1,10000000))invalid();
   return [id,{kind,portions:rule.portions,...(rule.offerCents===undefined?{}:{offerCents:rule.offerCents})}];
  }
  return invalid();
 }));
}

export const priceReason={
 expiry:'Kurze Resthaltbarkeit',
 quiet:'Ruhige Verkaufszeit',
 surplus:'Verfügbarer Bestand vor Feierabend',
 forecast:'Niedrige Nachfrageprognose',
 menu:'Menüangebot'
};

export function priceDecision(rule, data) {
 const now=minutes(data.time),closing=minutes(data.closing);
 // Keep the existing expiry rule compatible with sites without a schedule.
 if(rule.kind==='expiry')return data.urgent?{kind:rule.kind,capMinutes:null}:null;
 if(now===null||data.closed||!Number.isFinite(data.portions)||data.portions<1)return null;
 if(rule.kind==='quiet'){
  const start=minutes(rule.start),end=minutes(rule.end);
  if(now>=start&&now<end&&Number.isInteger(data.recentOrders)&&data.recentOrders<=rule.maxOrders)
   return {kind:rule.kind,capMinutes:Math.min(end,closing??end)-now};
 }
 if(rule.kind==='surplus'&&closing!==null&&closing>now&&closing-now<=rule.beforeClosing&&data.portions>=rule.portions)
  return {kind:rule.kind,capMinutes:closing-now};
 if(rule.kind==='forecast'){
  const f=data.forecast;
  if(f?.ready===true&&Number.isFinite(f.expectedOrders)&&f.expectedOrders>=0&&Number.isFinite(f.baselineOrders)&&f.baselineOrders>0&&f.expectedOrders*100<=f.baselineOrders*(100-rule.belowPercent))
   return {kind:rule.kind,capMinutes:closing===null?null:closing-now};
 }
 if(rule.kind==='menu'&&data.portions>=rule.portions)return {kind:rule.kind,capMinutes:closing===null?null:closing-now};
 return null;
}
