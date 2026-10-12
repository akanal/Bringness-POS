import {visibleCenterProducts} from './center-availability.js';
import {applyCenterStock} from './center-stock-bridge.js';
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
 // Online checkout keeps its existing rollout gate; onsite orders do not initiate a payment.
 const paymentMethod=b.paymentMethod||'online';
 if(!['online','onsite'].includes(paymentMethod))throw Error('INVALID_PAYMENT_METHOD');
 if(paymentMethod==='online'&&env.CENTER_CHECKOUT_ENABLED!=='true'||paymentMethod==='onsite'&&env.CENTER_ONSITE_ENABLED==='false')throw Error('CENTER_CHECKOUT_DISABLED');
 if(!/^[a-f0-9]{48}$/.test(b.code||'')||!uuid.test(b.restaurantId||'')||!uuid.test(b.requestId||''))throw Error('INVALID_CART');
 const canonical=Array.isArray(b.items)?[...b.items].sort((a,z)=>String(a.productId).localeCompare(String(z.productId))):[];
 const cartHash=crypto.createHash('sha256').update(JSON.stringify(canonical.map(i=>({productId:i.productId,quantity:i.quantity})))).digest('hex');
 const client=await pool.connect();let attempt;
 try{
 await client.query('BEGIN');
 const table=(await client.query(`SELECT t.id,t.center_id FROM center_tables t JOIN centers c ON c.id=t.center_id WHERE t.qr_token=$1 AND t.active=true AND c.active=true FOR UPDATE OF t`,[b.code])).rows[0];if(!table)throw Error('TABLE_UNAVAILABLE');
 attempt=(await client.query('SELECT * FROM center_checkout_attempts WHERE table_id=$1 AND request_id=$2',[table.id,b.requestId])).rows[0];
 if(attempt){if(attempt.cart_hash!==cartHash||attempt.restaurant_id!==b.restaurantId||(attempt.payment_method||'online')!==paymentMethod)throw Error('REQUEST_REUSED_WITH_DIFFERENT_CART');}
 else{
 const restaurant=(await client.query(`SELECT r.id FROM center_restaurants cr JOIN restaurants r ON r.id=cr.restaurant_id
 LEFT JOIN center_mollie_credentials mc ON mc.restaurant_id=r.id WHERE cr.center_id=$1 AND r.id=$2 AND cr.active=true
 AND cr.contract_status='signed' AND cr.payment_mode IN ($3,'choice')
 AND ($3='onsite' OR (cr.payment_status='verified' AND mc.verified_at IS NOT NULL AND mc.profile_id IS NOT NULL AND mc.organization_id=cr.merchant_reference))`,[table.center_id,b.restaurantId,paymentMethod])).rows[0];if(!restaurant)throw Error('MERCHANT_NOT_READY');
 const products=(await client.query(`SELECT p.id,p.name,p.price_cents,p.tax_rate,p.ai_stock_available,av.allergens availability_rule FROM products p LEFT JOIN product_translations av ON av.product_id=p.id AND av.language_code='avl' WHERE p.restaurant_id=$1 AND p.active=true AND p.id=ANY($2::uuid[])`,[restaurant.id,canonical.map(i=>i.productId)])).rows;
 const quote=quoteCenterCart(canonical,visibleCenterProducts(products));
 const order=(await client.query("INSERT INTO orders(restaurant_id,source,status,total_cents) VALUES($1,'center',$3,$2) RETURNING id",[restaurant.id,quote.totalCents,paymentMethod==='onsite'?'kitchen':'payment_pending'])).rows[0];
 for(const line of quote.lines)await client.query('INSERT INTO order_items(order_id,product_id,product_name_snapshot,unit_price_cents,tax_rate_snapshot,quantity) VALUES($1,$2,$3,$4,$5,$6)',[order.id,line.product.id,line.product.name,line.product.price_cents,line.product.tax_rate,line.quantity]);
 attempt=(await client.query(`INSERT INTO center_checkout_attempts(order_id,center_id,restaurant_id,table_id,request_id,cart_hash,payment_method) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,[order.id,table.center_id,restaurant.id,table.id,b.requestId,cartHash,paymentMethod])).rows[0];
 if(paymentMethod==='onsite'){
 await applyCenterStock(client,order.id,restaurant.id,'accept');
 await client.query(`INSERT INTO center_order_payments(payment_id,order_id,center_id,restaurant_id,merchant_reference,amount_cents,currency,payment_method,released_at,guest_status_token) VALUES($1,$2,$3,$4,'onsite',$5,'EUR','onsite',now(),$6)`,['onsite_'+order.id,order.id,table.center_id,restaurant.id,quote.totalCents,attempt.guest_status_token]);
 }
 }
 await client.query('COMMIT');
 }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
 if(paymentMethod==='onsite')return {orderId:attempt.order_id,paymentMethod:'onsite',statusUrl:'/center/status.html#token='+attempt.guest_status_token};
 let checkout=await createCenterMollieCheckout(pool,attempt.id,env,fetcher);
 if(checkout.reconciliationRequired)checkout=await reconcileCenterCheckout(pool,attempt.id,env,fetcher);
 return {...checkout,orderId:attempt.order_id};
}

export function guestCheckoutError(error) {
 const messages={
  INVALID_PAYMENT_METHOD:'Bitte eine gültige Zahlungsart auswählen.',
  REQUEST_REUSED_WITH_DIFFERENT_CART:'Dieser Vorgang gehört zu einer anderen Bestellung oder Zahlungsart.',
  PRODUCT_UNAVAILABLE:'Ein Gericht ist inzwischen nicht mehr verfügbar. Bitte den Warenkorb anpassen.',
  INVALID_CART:'Bitte Artikel und Mengen im Warenkorb prüfen.',
  INVALID_TOTAL:'Die Bestellsumme ist nicht zulässig. Bitte den Warenkorb anpassen.',
  TABLE_UNAVAILABLE:'Dieser Tisch ist momentan nicht für Bestellungen verfügbar.',
  MERCHANT_NOT_READY:'Dieses Restaurant kann diese Bestell- und Zahlungsart momentan nicht anbieten.',
  CENTER_CHECKOUT_DISABLED:'Diese Bestellart ist noch nicht freigeschaltet.'
 };
 if(error?.message==='REQUEST_REUSED_WITH_DIFFERENT_CART')return {status:409,error:messages[error.message],cartEditable:false};
 if(messages[error?.message])return {status:409,error:messages[error.message],cartEditable:true};
 return {status:503,error:'Der Zahlungsstatus ist noch unklar. Bitte denselben Vorgang erneut versuchen.',cartEditable:false};
}
