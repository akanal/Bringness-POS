export function parseDeliveryCart(input,idPattern,postcodePattern) {
  const {restaurantId,postcode,mode,items,expectedTotalCents} = input;
  if (typeof restaurantId!=='string' || !idPattern.test(restaurantId) ||
      typeof postcode!=='string' || !postcodePattern.test(postcode) || !['pickup','delivery'].includes(mode) ||
      !Number.isSafeInteger(expectedTotalCents) || !Array.isArray(items) || !items.length || items.length>20 ||
      items.some(item=>typeof item?.id!=='string'||!idPattern.test(item.id)||!Number.isInteger(item.qty)||item.qty<1||item.qty>99)) {
    return {error:'Bitte Bestellart, Postleitzahl und Warenkorb prüfen.'};
  }
  const cart = items.map(({id,qty})=>({id:id.toLowerCase(),qty})).sort((a,b)=>a.id.localeCompare(b.id));
  if (new Set(cart.map(item=>item.id)).size !== cart.length) return {error:'Doppelte Artikel im Warenkorb.'};
  return {restaurantId,postcode,mode,cart,expectedTotalCents};
}

export async function priceDeliveryCart(client,{restaurantId,postcode,mode,cart,expectedTotalCents}) {
  const settings = (await client.query('SELECT settings FROM pos_delivery_locations WHERE restaurant_id=$1 FOR SHARE',[restaurantId])).rows[0]?.settings;
  const available = mode==='pickup' ? settings?.pickup && settings.postcode===postcode : settings?.delivery && settings.zones?.includes(postcode);
  if (!available) {
    return {error:'Diese Bestellart ist am Standort derzeit nicht verfügbar.'};
  }
  const products = (await client.query(`SELECT p.id,p.name,p.price_cents,p.tax_rate
    FROM products p LEFT JOIN categories c ON c.id=p.category_id AND c.restaurant_id=p.restaurant_id
    WHERE p.restaurant_id=$1 AND p.id=ANY($2::uuid[]) AND p.active
    AND (p.category_id IS NULL OR c.active)
    AND coalesce((to_jsonb(p)->>'ai_stock_available')::boolean,true) FOR SHARE OF p`,[restaurantId,cart.map(item=>item.id)])).rows;
  const byId = new Map(products.map(product=>[product.id,product]));
  if (cart.some(item=>!byId.has(item.id)||!settings.productIds?.includes(item.id))) {
    return {error:'Ein Gericht ist nicht mehr verfügbar. Bitte Speisekarte neu laden.'};
  }
  const subtotal = cart.reduce((sum,item)=>sum+byId.get(item.id).price_cents*item.qty,0);
  const fee = mode==='delivery' ? settings.feeCents : 0;
  const totalCents = subtotal+fee;
  if (totalCents<=0 || totalCents>100000000 || totalCents!==expectedTotalCents ||
      (mode==='delivery' && subtotal<settings.minimumCents)) {
    return {error:'Preis oder Mindestbestellwert hat sich geändert. Bitte prüfe den Warenkorb.'};
  }
  return {byId,subtotal,fee,totalCents};
}
