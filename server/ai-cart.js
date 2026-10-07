import crypto from 'node:crypto';
import {hash,uuid,orderAmounts} from './ai-policy.js';
import {supplierMayTrade} from './ai-collection.js';
const fail=message=>{throw Object.assign(Error(message),{status:400})};
const id=value=>{if(!uuid.test(String(value)))fail('Ungültige ID');return value};
export async function cartTransaction(db,u,b,{checkout=true,trade=supplierMayTrade,authorize,onCreated}={}){
 if(u.role!=='restaurant')throw Object.assign(Error('Nur Restaurants können bestellen'),{status:403});
   if(!Array.isArray(b.lines)||!b.lines.length||b.lines.length>50)fail('1 bis 50 Positionen erforderlich');
   if(!/^\d{4}-\d{2}-\d{2}$/.test(String(b.deliveryDate))||!Number.isFinite(Date.parse(b.deliveryDate))||new Date(b.deliveryDate).toISOString().slice(0,10)!==b.deliveryDate)fail('Gültiges Lieferdatum erforderlich');
   const seen=new Set();const lines=b.lines.map(l=>{id(l.productId);id(l.stockId);if(!Number.isInteger(l.packs)||l.packs<1||l.packs>10000)fail('Ganze Packungen zwischen 1 und 10000 erforderlich');const key=l.productId+':'+l.stockId;if(seen.has(key))fail('Doppelte Position bitte zusammenfassen');seen.add(key);return {productId:l.productId,stockId:l.stockId,packs:l.packs}}).sort((a,z)=>(a.productId+a.stockId).localeCompare(z.productId+z.stockId));
   if(checkout){id(b.requestKey);if(b.confirmed!==true)fail('Bestellung muss ausdrücklich bestätigt werden');}
   const fingerprint=hash(JSON.stringify({lines,deliveryDate:b.deliveryDate,quote:b.quote}));
   const c=await db.connect();try{await c.query('BEGIN');const buyer=(await c.query('SELECT * FROM ai_accounts WHERE id=$1 FOR UPDATE',[u.id])).rows[0];
    if(checkout){const old=(await c.query('SELECT * FROM ai_checkouts WHERE buyer_id=$1 AND request_key=$2',[u.id,b.requestKey])).rows[0];if(old){if(old.fingerprint!==fingerprint)fail('Bestellkennung bereits für einen anderen Warenkorb verwendet');await c.query('COMMIT');return {status:200,orders:old.orders,replayed:true}}}
    if(!(await c.query("SELECT value FROM ai_settings WHERE key='launch'")).rows[0].value.ordersEnabled)fail('Bestellungen sind noch nicht freigeschaltet');
    if(!buyer.address||!buyer.city)fail('Restaurant muss zuerst seine Geschäftsanschrift hinterlegen');
    const groups=new Map(),prepared=[];
    for(const l of lines){const stock=(await c.query('SELECT st.*,loc.name location_name,loc.address location_address FROM ai_stock st JOIN ai_locations loc ON loc.id=st.location_id WHERE st.id=$1 AND st.account_id=$2 FOR SHARE OF st,loc',[l.stockId,u.id])).rows[0];
     const product=(await c.query("SELECT p.*,s.business_name,s.minimum_order_cents,s.address,s.city,s.delivery_area,s.delivery_terms FROM ai_products p JOIN ai_accounts s ON s.id=p.supplier_id WHERE p.id=$1 AND p.active AND p.available AND s.status='active' FOR SHARE OF p,s",[l.productId])).rows[0];
     if(!stock||!product)fail('Zutat oder Angebot nicht mehr verfügbar');if(stock.unit!==product.unit)fail('Einheiten müssen übereinstimmen');if(l.packs<product.minimum_packs)fail('Mindestmenge des Produkts beachten');if(!product.address||!product.city)fail('Lieferant muss zuerst seine Geschäftsanschrift hinterlegen');
     if(!groups.has(product.supplier_id)){if(!await trade(product.supplier_id,c))fail('Lieferant wartet auf SEPA-Freigabe');groups.set(product.supplier_id,{supplierId:product.supplier_id,name:product.business_name,minimumCents:Number(product.minimum_order_cents),deliveryArea:product.delivery_area,terms:product.delivery_terms,netCents:0,lines:[]})}
     const amounts=orderAmounts(Number(product.price_cents),l.packs,200),address=[buyer.business_name,stock.location_name,stock.location_address||[buyer.address,buyer.postal_code,buyer.city].filter(Boolean).join(', ')].filter(Boolean).join(', ');
     const item={...l,name:product.name,unit:product.unit,packQuantity:String(product.pack_quantity),priceCents:Number(product.price_cents),netCents:amounts.netCents,commissionCents:amounts.commissionCents,deliveryAddress:address};
     const group=groups.get(product.supplier_id);group.netCents+=amounts.netCents;if(!Number.isSafeInteger(group.netCents))fail('Warenkorb zu groß');group.lines.push(item);prepared.push({item,product,stock});
    }
    const quote={deliveryDate:b.deliveryDate,buyerEmail:buyer.email,groups:[...groups.values()],netCents:[...groups.values()].reduce((n,g)=>n+g.netCents,0)};if(!Number.isSafeInteger(quote.netCents))fail('Warenkorb zu groß');
    const warnings=quote.groups.filter(g=>g.netCents<g.minimumCents).map(g=>g.name+': Mindestbestellwert noch nicht erreicht');
    if(!checkout){await c.query('COMMIT');return {status:200,quote,warnings,canOrder:warnings.length===0}}
    if(warnings.length)fail(warnings.join(' · '));if(JSON.stringify(b.quote)!==JSON.stringify(quote))fail('Angebot oder Lieferbedingungen geändert. Warenkorb erneut prüfen');
    if(authorize)await authorize(c,quote);
    const groupIds=new Map(quote.groups.map(g=>[g.supplierId,crypto.randomUUID()])),orders=[];
    for(const {item:l,product,stock} of prepared){orders.push((await c.query('INSERT INTO ai_orders(buyer_id,supplier_id,stock_id,product_id,product_name,unit,pack_quantity,packs,net_cents,commission_bps,commission_cents,request_key,delivery_date,delivery_address,buyer_email,supplier_terms,checkout_id,supplier_order_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,200,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING *',[u.id,product.supplier_id,stock.id,product.id,product.name,product.unit,product.pack_quantity,l.packs,l.netCents,l.commissionCents,crypto.randomUUID(),b.deliveryDate,l.deliveryAddress,buyer.email,[product.delivery_area,product.delivery_terms].filter(Boolean).join(' · '),b.requestKey,groupIds.get(product.supplier_id)])).rows[0])}
    await c.query('INSERT INTO ai_checkouts VALUES($1,$2,$3,$4::jsonb)',[u.id,b.requestKey,fingerprint,JSON.stringify(orders)]);await c.query("INSERT INTO ai_audit(actor_id,action,detail) VALUES($1,'cart_checkout',$2::jsonb)",[u.id,JSON.stringify({checkoutId:b.requestKey,suppliers:groupIds.size,lines:orders.length,netCents:quote.netCents})]);if(onCreated)await onCreated(c,{orders,quote});await c.query('COMMIT');return {status:201,orders};
   }catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}
}
