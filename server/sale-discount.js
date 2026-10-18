export function normalizeDiscount(discount){
 if(discount==null)return null;
 if(!discount||typeof discount!=='object'||Array.isArray(discount)||!['amount','percent'].includes(discount.kind)||!Number.isSafeInteger(discount.value)||discount.value<0||discount.value>(discount.kind==='percent'?10000:2147483647))throw Error('Ungültiger Rabatt');
 return discount.value?{kind:discount.kind,value:discount.value}:null;
}
// Percentage values are basis points; amount values are integer EUR cents.
export function discountedSale(lines,discount){
 discount=normalizeDiscount(discount);const subtotal=lines.reduce((s,l)=>s+l.grossCents,0);
 if(!Number.isSafeInteger(subtotal)||subtotal<=0||subtotal>2147483647||lines.some(l=>!Number.isSafeInteger(l.grossCents)||l.grossCents<0)||new Set(lines.map(l=>l.id)).size!==lines.length)throw Error('Ungültige Positionssumme');
 const amount=!discount?0:discount.kind==='amount'?discount.value:Number((BigInt(subtotal)*BigInt(discount.value)+5000n)/10000n);
 if(amount>=subtotal)throw Error('Rabatt muss kleiner als die Warenkorbsumme sein');
 const allocations=lines.map(l=>{const n=BigInt(l.grossCents)*BigInt(amount);return {...l,discountCents:Number(n/BigInt(subtotal)),remainder:n%BigInt(subtotal)}});
 let remaining=amount-allocations.reduce((s,l)=>s+l.discountCents,0);
 for(const l of [...allocations].sort((a,b)=>a.remainder===b.remainder?String(a.id).localeCompare(String(b.id)):a.remainder>b.remainder?-1:1)){if(!remaining)break;l.discountCents++;remaining--;}
 return {subtotalCents:subtotal,discountCents:amount,totalCents:subtotal-amount,discount,allocations:allocations.map(({id,discountCents})=>({productId:id,discountCents}))};
}
export const lineDiscount=(adjustment,productId)=>adjustment?.allocations?.find(l=>l.productId===productId)?.discountCents||0;
