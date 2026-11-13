const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
// Omit empty selections to preserve fingerprints of already pending checkouts.
export function selectedExtras(value,{trade=false}={}){
 if(value==null)return {};
 if(!Array.isArray(value)||value.length>20||value.some(id=>typeof id!=='string'||!uuid.test(id)))throw Error('Ungültige Extras');
 const extraIds=value.map(id=>id.toLowerCase()).sort();
 if(new Set(extraIds).size!==extraIds.length)throw Error('Extra doppelt');
 if(trade&&extraIds.length)throw Error('Extras sind nur im Einzelhandel verfügbar');
 return extraIds.length?{extraIds}:{};
}
export function pricedExtras(product,ids,rows){
 const extras=(ids||[]).map(id=>{const row=rows.find(r=>r.id===id&&r.product_id===product.id);if(!row)throw Error('Ein gewähltes Extra ist nicht mehr verfügbar. Warenkorb prüfen.');const cents=Number(row.price_cents);if(!Number.isSafeInteger(cents)||cents<0)throw Error('Ungültiger Extrapreis');return {id:row.id,name:row.name,price_cents:cents};});
 const price=Number(product.price_cents)+extras.reduce((sum,e)=>sum+e.price_cents,0);
 if(!Number.isSafeInteger(price)||price>2147483647)throw Error('Artikelpreis zu groß');
 return {extras,price,name:product.name+(extras.length?' ('+extras.map(e=>e.name).join(', ')+')':'')};
}
