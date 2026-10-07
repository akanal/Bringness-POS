import crypto from 'node:crypto';
export const offlineUuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const fail=message=>{throw Object.assign(Error(message),{status:400})};
// Shared by local PostgreSQL and the cloud importer. Prices always come from a
// server-issued immutable catalog, never from fields in the sales request.
export function quoteOfflineSale(snapshot,sale) {
 if(!offlineUuid.test(sale?.id||'')||sale.snapshotId!==snapshot.id)fail('Ungültige Offline-Kennung');
 const time=Date.parse(sale.createdAt),start=Date.parse(snapshot.createdAt),end=Date.parse(snapshot.validUntil);
 if(!Number.isFinite(time)||time<start-60000||time>end||time>Date.now()+60000)fail('Verkauf außerhalb der freigegebenen Offline-Zeit');
 const restaurant=snapshot.restaurants.find(r=>r.id===sale.restaurantId);if(!restaurant)fail('Betrieb nicht im Offline-Katalog');
 if(!Array.isArray(sale.items)||!sale.items.length||sale.items.length>100)fail('1 bis 100 Positionen erforderlich');
 const seen=new Set();let totalCents=0;
 const items=sale.items.map(i=>{
  const product=snapshot.products.find(p=>p.id===i.productId&&p.restaurantId===restaurant.id);
  if(!product||seen.has(i.productId)||!Number.isInteger(i.quantity)||i.quantity<1||i.quantity>999)fail('Ungültiger Offline-Artikel oder Menge');
  seen.add(i.productId);if(!Number.isSafeInteger(product.priceCents)||product.priceCents<0||!Number.isFinite(product.taxRate)||product.taxRate<0||product.taxRate>100)fail('Ungültiger Katalogpreis');
  const lineCents=product.priceCents*i.quantity;totalCents+=lineCents;
  return {productId:product.id,name:product.name,unitPriceCents:product.priceCents,taxRate:product.taxRate,quantity:i.quantity,lineCents};
 });
 if(!Number.isSafeInteger(totalCents)||totalCents<=0||totalCents>2147483647)fail('Ungültiger Gesamtbetrag');
 if(sale.paymentMethod!=='cash')fail('Offline wird nur eine bestätigte Barzahlung unterstützt');
 return {id:sale.id,snapshotId:snapshot.id,restaurantId:restaurant.id,createdAt:new Date(time).toISOString(),items,totalCents,paymentMethod:'cash',merchant:snapshot.merchant[restaurant.id],receiptNumber:'OFF-'+snapshot.deviceKey.slice(0,12)+'-'+sale.id,fiscalStatus:'pending'};
}
export function canonicalJson(value){return JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v)}
export function offlineFingerprint(value){return crypto.createHash('sha256').update(canonicalJson(value)).digest('hex')}
