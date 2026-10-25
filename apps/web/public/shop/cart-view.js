import {money} from './catalog.js';
const node=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;};
export function lineAmounts(line){const vatCents=Math.round(line.netCents*19/100);return {netCents:line.netCents,vatCents,grossCents:line.netCents+vatCents};}
export function quantityValue(value){if(String(value).trim()==='')return null;const n=Number(value);return Number.isInteger(n)&&n>=1&&n<=99?n:null;}
export function mountCartLine(line,{onQuantity,onRemove,onSave,onDetails,onValidity}){
 const row=node('div',undefined,'basket-line'),info=node('div',undefined,'basket-info'),amounts=lineAmounts(line);
 info.append(node('h3',line.name),node('p',`${money(line.unitNetCents)} netto ${line.period==='monthly'?'/ Monat':'einmalig'}`));
 const control=(label,action,fn)=>{const b=node('button',label);b.type='button';b.dataset.cartProduct=line.id;b.dataset.cartAction=action;b.addEventListener('click',fn);return b;};
 info.append(control('Details ansehen','details',onDetails));
 const quantity=node('div',undefined,'quantity-control'),label=node('label','Menge'),input=node('input');input.type='number';input.min='1';input.max='99';input.step='1';input.value=line.quantity;input.dataset.cartProduct=line.id;input.dataset.cartAction='quantity';input.setAttribute('aria-label','Menge für '+line.name);
 const error=node('p',undefined,'quantity-error');error.id='quantity-error-'+line.id;error.setAttribute('role','alert');input.setAttribute('aria-describedby',error.id);
 const commit=()=>{const n=quantityValue(input.value);if(n===null){input.setAttribute('aria-invalid','true');error.textContent='Bitte eine ganze Menge von 1 bis 99 eingeben. Die bisherigen Beträge bleiben unverändert.';onValidity(false);return;}input.removeAttribute('aria-invalid');onValidity(true);onQuantity(n);};input.addEventListener('change',commit);
 const minus=control('−','minus',()=>onQuantity(line.quantity-1)),plus=control('+','plus',()=>onQuantity(line.quantity+1));minus.disabled=line.quantity<=1;plus.disabled=line.quantity>=99;minus.setAttribute('aria-label','Menge für '+line.name+' verringern');plus.setAttribute('aria-label','Menge für '+line.name+' erhöhen');label.append(input);quantity.append(minus,label,plus);
 const sum=node('div',undefined,'basket-line-sum');sum.append(node('strong',money(amounts.grossCents)+' brutto'),node('span',money(amounts.netCents)+' netto'),node('span',money(amounts.vatCents)+' MwSt.'),node('span',line.period==='monthly'?'pro Monat':'einmalig'));
 const actions=node('div',undefined,'basket-line-actions');actions.append(control('Entfernen','remove',onRemove),control('Für später merken','save',onSave));
 row.append(info,quantity,sum,error,actions);return row;
}
