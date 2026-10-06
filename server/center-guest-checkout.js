import {visibleCenterProducts} from './center-availability.js';
import crypto from 'node:crypto';
import {createCenterMollieCheckout,reconcileCenterCheckout} from './center-mollie-checkout.js';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function quoteCenterCart(items,products){
 if(!Array.isArray(items)||!items.length||items.length>30)throw Error('INVALID_CART');
 const seen=new Set(),lines=[];let total=0;
 for(const item of items){if(!uuid.test(item.productId||'')||seen.has(item.productId)||!Number.isInteger(item.quantity)||item.quantity<1||item.quantity>99)throw Error('INVALID_CART');seen.add(item.productId);
 const product=products.find(p=>p.id===item.productId);if(!product||!Number.isSafeInteger(product.price_cents)||product.price_cents<0)throw Error('PRODUCT_UNAVAILABLE');
 total+=product.price_cents*item.quantity;lines.push({product,quantity:item.quantity});}
 if(!Number.isSafeInteger(total)||total<=0||total>1000000)throw Error('INVALID_TOTAL');return {totalCents:total,lines};
}
export async function guestCenterCheckout(pool,b,env=process.env,fetcher=fetch){
 // Remains disabled until inventory, fiscal records and end-to-end rollout checks are complete.
 if(env.CENTER_CHECKOUT_ENABLED!=='true')throw Error('CENTER_CHECKOUT_DISABLED');
 if(!/^[a-f0-9]{48}$/.test(b.code||'')||!uuid.test(b.restaurantId||'')||!uuid.test(b.requestId||''))throw Error('INVALID_CART');
 const canonical=Array.isArray(b.items)?[...b.items].sort((a,z)=>String(a.productId).localeCompare(String(z.productId))):[];
 const cartHash=crypto.createHash('sha256').update(JSON.stringify(canonical.map(i=>({productId:i.productId,quantity:i.quantity})))).digest('hex');
 const client=await pool.connect();let attempt;
 try{
 await client.query('BEGIN');
 const table=(await client.query(`SELECT t.id,t.center_id FROM center_tables t JOIN centers c ON c.id=t.center_id WHERE t.qr_token=$1 AND t.active=true AND c.active=true FOR UPDATE OF t`,[b.code])).rows[0];if(!table)throw Error('TABLE_UNAVAILABLE');
 attempt=(await client.query('SELECT * FROM center_checkout_attempts WHERE table_id=$1 AND request_id=$2',[table.id,b.requestId])).rows[0];
 if(attempt){if(attempt.cart_hash!==cartHash||attempt.restaurant_id!==b.restaurantId)throw Error('REQUEST_REUSED_WITH_DIFFERENT_CART');}
 else{
 const restaurant=(await client.query(`SELECT r.id FROM center_restaurants cr JOIN restaurants r ON r.id=cr.restaurant_id
 JOIN center_mollie_credentials mc ON mc.restaurant_id=r.id WHERE cr.center_id=$1 AND r.id=$2 AND cr.active=true
 AND cr.contract_status='signed' AND cr.payment_status='verified' AND mc.verified_at IS NOT NULL`,[table.center_id,b.restaurantId])).rows[0];if(!restaurant)throw Error('MERCHANT_NOT_READY');
 const products=(await client.query(`SELECT p.id,p.name,p.price_cents,p.tax_rate,p.ai_stock_available,av.allergens availability_rule FROM products p LEFT JOIN product_translations av ON av.product_id=p.id AND av.language_code='avl' WHERE p.restaurant_id=$1 AND p.active=true AND p.id=ANY($2::uuid[])`,[restaurant.id,canonical.map(i=>i.productId)])).rows;
 const quote=quoteCenterCart(canonical,visibleCenterProducts(products));
 const order=(await client.query("INSERT INTO orders(restaurant_id,source,status,total_cents) VALUES($1,'center','payment_pending',$2) RETURNING id",[restaurant.id,quote.totalCents])).rows[0];
 for(const line of quote.lines)await client.query('INSERT INTO order_items(order_id,product_id,product_name_snapshot,unit_price_cents,tax_rate_snapshot,quantity) VALUES($1,$2,$3,$4,$5,$6)',[order.id,line.product.id,line.product.name,line.product.price_cents,line.product.tax_rate,line.quantity]);
 attempt=(await client.query(`INSERT INTO center_checkout_attempts(order_id,center_id,restaurant_id,table_id,request_id,cart_hash) VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,[order.id,table.center_id,restaurant.id,table.id,b.requestId,cartHash])).rows[0];
 }
 await client.query('COMMIT');
 }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
 let checkout=await createCenterMollieCheckout(pool,attempt.id,env,fetcher);
 if(checkout.reconciliationRequired)checkout=await reconcileCenterCheckout(pool,attempt.id,env,fetcher);
 return {...checkout,orderId:attempt.order_id};
}

export function guestCheckoutError(error) {
 const messages={
  PRODUCT_UNAVAILABLE:'Ein Gericht ist inzwischen nicht mehr verfügbar. Bitte den Warenkorb anpassen.',
  INVALID_CART:'Bitte Artikel und Mengen im Warenkorb prüfen.',
  INVALID_TOTAL:'Die Bestellsumme ist nicht zulässig. Bitte den Warenkorb anpassen.',
  TABLE_UNAVAILABLE:'Dieser Tisch ist momentan nicht für Bestellungen verfügbar.',
  MERCHANT_NOT_READY:'Dieses Restaurant kann momentan keine Online-Zahlungen annehmen.',
  CENTER_CHECKOUT_DISABLED:'Online-Bestellungen sind noch nicht freigeschaltet.'
 };
 if(messages[error?.message])return {status:409,error:messages[error.message],cartEditable:true};
 return {status:503,error:'Der Zahlungsstatus ist noch unklar. Bitte denselben Vorgang erneut versuchen.',cartEditable:false};
}
