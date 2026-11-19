import {createHash} from 'node:crypto';
const fail=message=>{throw Object.assign(Error(message),{status:400})};
const text=(v,max)=>{if(typeof v!=='string'||v.length>max)fail('Textangaben prüfen');return v.trim()};
export function normalizeMenu(input){
 if(!input||!Array.isArray(input.items)||!input.items.length||input.items.length>100)fail('1 bis 100 Gerichte erforderlich');
 const title=text(input.title,150);if(!title)fail('Kartentitel erforderlich');
 const seen=new Set();const items=input.items.map(i=>{
  if(!i||typeof i!=='object')fail('Gericht prüfen');
  const recipeId=text(i.recipeId,36),name=text(i.name,150),category=text(i.category,80),description=text(i.description,600);
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(recipeId)||!name||seen.has(recipeId))fail('Eindeutige Rezepte und Namen erforderlich');seen.add(recipeId);
  if(i.priceCents!==null&&(!Number.isSafeInteger(i.priceCents)||i.priceCents<0||i.priceCents>10000000))fail('Bruttopreis in Cent prüfen');
  if(typeof i.visible!=='boolean')fail('Sichtbarkeit prüfen');
  return {recipeId,name,category,description,priceCents:i.priceCents,visible:i.visible};
 });return {title,items};
}
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'&&!(value instanceof Date)?Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])):value;
export const menuDigest=value=>createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
export function menuSuggestions(recipes){return recipes.map(r=>({recipeId:r.id,name:r.name,cost:r.cost,notes:[
 ...(r.cost.complete?['Bestätigte Warenkosten: '+(r.cost.netCents/100).toFixed(2)+' € netto je Portion. Verkaufspreis, Steuer und Zielmarge vor Preisänderungen prüfen.']:['Einkaufspreise unvollständig; kein belastbarer Preisvorschlag.']),
 ...(!r.active?['Rezept ist pausiert. Aufnahme ausdrücklich prüfen.']:[]),
 ...(r.items.some(i=>Number(i.quantity)>Math.max(0,Number(i.stock_quantity)-Number(i.reserved_quantity)))?['Freier Bestand reicht für mindestens eine Zutat nicht für eine Portion. Angebot prüfen.']:[])
 ]}));}
