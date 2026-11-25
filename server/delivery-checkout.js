import {customerSessionHash} from './delivery-customer-account.js';
import {recordPosOnlineSettlement} from './pos-online-settlement.js';
import {createHash} from 'node:crypto';
import {withMerchantToken} from './center-mollie-merchant.js';
import {mollieFetch} from './mollie-request.js';
import {molliePaymentReadUrl} from './center-mollie-mode.js';
import {providerEuroCents} from './provider-money.js';
import {parseDeliveryCart,priceDeliveryCart} from './delivery-cart.js';
import {readJsonObject,readRequestBytes} from './http-body.js';

const paymentIdPattern = /^tr_[a-zA-Z0-9]+$/;

export async function migrateDeliveryCheckout(db) {
  await db.query(`CREATE TABLE IF NOT EXISTS pos_delivery_checkout_tests (
    id uuid PRIMARY KEY,
    restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    fingerprint text NOT NULL,
    organization_id text NOT NULL,
    profile_id text NOT NULL,
    total_cents integer NOT NULL,
    items jsonb NOT NULL,
    payment_id text UNIQUE,
    checkout_url text,
    order_id uuid REFERENCES orders(id)
  )`);
  await db.query('ALTER TABLE pos_delivery_checkout_tests ADD COLUMN IF NOT EXISTS delivery_address jsonb');
  await db.query('ALTER TABLE pos_delivery_checkout_tests ADD COLUMN IF NOT EXISTS customer_id uuid');
  await db.query(`CREATE INDEX IF NOT EXISTS delivery_checkout_customer_idx
    ON pos_delivery_checkout_tests(customer_id) WHERE customer_id IS NOT NULL`);
  await db.query("ALTER TABLE pos_delivery_checkout_tests ADD COLUMN IF NOT EXISTS payment_mode text NOT NULL DEFAULT 'test' CHECK (payment_mode IN ('test','live'))");
  await db.query('ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_test_address jsonb');
  await db.query('ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_test_paid_at timestamptz');
}

async function transaction(db,operation) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const result = await operation(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

function readDeliveryAddress(address,postcode) {
  const normalize = (value,max) => typeof value==='string' && !/[\p{Cc}\p{Cf}]/u.test(value) && value.trim().length<=max ? value.trim() : '';
  const recipient = normalize(address?.recipient,100);
  const street = normalize(address?.street,140);
  const city = normalize(address?.city,100);
  return recipient && street && city ? {recipient,street,city,postcode} : null;
}

function validatePayment(payment,attempt) {
  if (!paymentIdPattern.test(payment.id ?? '') ||
      (attempt.payment_id && attempt.payment_id!==payment.id) ||
      payment.profileId!==attempt.profile_id || payment.mode!==attempt.payment_mode ||
      payment.metadata?.bringnessDeliveryCheckout!==attempt.id ||
      providerEuroCents(payment.amount)!==attempt.total_cents) {
    throw Error('DELIVERY_PAYMENT_MISMATCH');
  }
}

export function createDeliveryCheckout(db,{idPattern,postcodePattern,origin,liveRestaurantId,sandboxRestaurantId,mode='test',withToken=withMerchantToken,fetcher=fetch}) {
  if (mode!=='test' && (mode!=='live' || !idPattern.test(liveRestaurantId ?? ''))) throw Error('INVALID_DELIVERY_CHECKOUT_MODE');
  const live = mode==='live';
  const prefix = live ? '' : 'test-';
  async function provider(attempt,operation) {
    return withToken(db,attempt.restaurant_id,async(token,envelope)=>{
      const {rows} = await db.query(`SELECT 1 FROM center_mollie_credentials
        WHERE restaurant_id=$1 AND token_envelope=$2 AND organization_id=$3 AND profile_id=$4`,
      [attempt.restaurant_id,envelope,attempt.organization_id,attempt.profile_id]);
      if (!rows.length) throw Error('DELIVERY_MERCHANT_CHANGED');
      return operation({authorization:'Bearer '+token,accept:'application/json'});
    });
  }

  async function confirm(attempt) {
    if (attempt.order_id) {
      const result = {status:'paid',orderId:attempt.order_id};
      if (live) {
        const {rows:[order]} = await db.query('SELECT status FROM orders WHERE id=$1',[attempt.order_id]);
        result.fulfillmentStatus = order.status;
      }
      return result;
    }
    if (!attempt.payment_id) return {status:'unconfirmed'};
    const payment = await provider(attempt,async headers=>{
      const response = await mollieFetch(molliePaymentReadUrl('/v2/payments/'+attempt.payment_id,mode),{headers},fetcher);
      if (!response.ok) throw Error('DELIVERY_PAYMENT_READ_FAILED');
      return response.json();
    });
    validatePayment(payment,attempt);
    if (payment.status!=='paid') return {status:['canceled','expired','failed'].includes(payment.status) ? payment.status : 'pending'};
    const paidAt = typeof payment.paidAt==='string' ? Date.parse(payment.paidAt) : NaN;
    if (!Number.isFinite(paidAt) || paidAt>Date.now()+60000 ||
        (payment.amountRefunded && providerEuroCents(payment.amountRefunded)!==0) ||
        (payment.amountChargedBack && providerEuroCents(payment.amountChargedBack)!==0)) {
      return {status:'review'};
    }
    return transaction(db,async client=>{
      const {rows:[locked]} = await client.query('SELECT t.order_id,o.status FROM pos_delivery_checkout_tests t LEFT JOIN orders o ON o.id=t.order_id WHERE t.id=$1 FOR UPDATE OF t',[attempt.id]);
      if (locked.order_id) return {status:'paid',orderId:locked.order_id,...(live ? {fulfillmentStatus:locked.status} : {})};
      const {rows:[order]} = await client.query(`INSERT INTO orders (restaurant_id,source,status,total_cents,delivery_test_address,delivery_test_paid_at)
        VALUES ($1,$2,'open',$3,$4,$5) RETURNING id`,[attempt.restaurant_id,
        live ? 'web_pickup' : attempt.delivery_address ? 'web_test_delivery' : 'web_test_pickup',
        attempt.total_cents,attempt.delivery_address,live ? null : new Date(paidAt).toISOString()]);
      for (const item of attempt.items) {
        await client.query(`INSERT INTO order_items
          (order_id,product_name_snapshot,unit_price_cents,tax_rate_snapshot,quantity,product_id)
          VALUES ($1,$2,$3,$4,$5,(SELECT id FROM products WHERE id=$6 AND restaurant_id=$7))`,
          [order.id,item.name,item.cents,item.taxRate,item.qty,live ? item.productId : null,attempt.restaurant_id]);
      }
      if (live) {
        await recordPosOnlineSettlement(client,{orderId:order.id,restaurantId:attempt.restaurant_id,amountCents:attempt.total_cents});
      } else {
        await client.query('INSERT INTO pos_delivery_test_requests (request_id,fingerprint,order_id) VALUES ($1,$2,$3)',[attempt.id,attempt.fingerprint,order.id]);
      }
      await client.query('UPDATE pos_delivery_checkout_tests SET order_id=$2 WHERE id=$1',[attempt.id,order.id]);
      return {status:'paid',orderId:order.id,...(live ? {fulfillmentStatus:'open'} : {})};
    });
  }

  return async function checkout(req,send,action) {
    if (!origin) return send(404,{error:'Mollie-Testzahlung ist hier nicht verfügbar.'});
    if (action==='webhook') {
      if (req.method!=='POST') return send(405,{error:'Methode nicht erlaubt.'});
      if (req.headers['content-type']?.split(';')[0].trim().toLowerCase()!=='application/x-www-form-urlencoded') {
        return send(415,{error:'Ungültiges Format.'});
      }
      let body;
      try { body = await readRequestBytes(req,{maxBytes:1024}); }
      catch (error) {
        if (!error.status) throw error;
        return send(error.status,{error:error.message});
      }
      const ids = new URLSearchParams(body.toString('utf8')).getAll('id');
      if (ids.length!==1 || !paymentIdPattern.test(ids[0])) return send(400,{error:'Ungültige Zahlungskennung.'});
      const {rows:[attempt]} = await db.query('SELECT * FROM pos_delivery_checkout_tests WHERE payment_id=$1 AND payment_mode=$2',[ids[0],mode]);
      // Retry callbacks that arrived before the create response was recorded.
      if (!attempt) return send(503,{received:false});
      try {
        await confirm(attempt);
        return send(200,{received:true});
      } catch {
        return send(503,{received:false});
      }
    }
    if (action==='status') {
      if (req.method!=='GET') return send(405,{error:'Methode nicht erlaubt.'});
      const id = /^Bearer (\S+)$/i.exec(req.headers.authorization ?? '')?.[1];
      if (!idPattern.test(id ?? '')) return send(404,{error:'Zahlung nicht gefunden.'});
      const {rows:[attempt]} = await db.query('SELECT * FROM pos_delivery_checkout_tests WHERE id=$1 AND payment_mode=$2',[id,mode]);
      if (!attempt) return send(404,{error:'Zahlung nicht gefunden.'});
      try {
        return send(200,await confirm(attempt));
      } catch {
        return send(503,{error:'Zahlung konnte noch nicht bestätigt werden.'});
      }
    }

    if (req.method!=='POST') return send(405,{error:'Methode nicht erlaubt.'});
    let input;
    try { input = await readJsonObject(req,{maxBytes:8192}); }
    catch (error) {
      if (!error.status) throw error;
      return send(error.status,{error:error.message});
    }
    const cart = parseDeliveryCart(input,idPattern,postcodePattern);
    if (cart.error) return send(400,cart);
    if (typeof input.requestId!=='string' || !idPattern.test(input.requestId)) {
      return send(400,{error:'Ungültige Vorgangskennung.'});
    }
    if (sandboxRestaurantId && cart.restaurantId.toLowerCase()!==sandboxRestaurantId.toLowerCase()) {
      return send(404,{error:'Testzahlung ist an diesem Standort nicht verfügbar.'});
    }
    if (live && (cart.mode!=='pickup' || cart.restaurantId.toLowerCase()!==liveRestaurantId.toLowerCase())) {
      return send(404,{error:'Onlinezahlung ist an diesem Standort derzeit nicht verfügbar.'});
    }
    const id = input.requestId.toLowerCase();
    const address = cart.mode==='delivery' ? readDeliveryAddress(input.address,cart.postcode) : null;
    if (cart.mode==='delivery' && !address) return send(400,{error:'Bitte Name, Straße mit Hausnummer und Ort eingeben.'});
    const fingerprint = createHash('sha256').update(JSON.stringify(address ? {...cart,address} : cart)).digest('hex');
    const customerSession = !live && sandboxRestaurantId ? customerSessionHash(req) : null;
    const reservation = await transaction(db,async client=>{
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1::text,1))',[id]);
      const {rows:[existing]} = await client.query('SELECT * FROM pos_delivery_checkout_tests WHERE id=$1',[id]);
      if (existing) {
        if (existing.payment_mode!==mode || existing.fingerprint!==fingerprint) return {error:'Vorgangskennung gehört zu einem anderen Warenkorb.'};
        return {existing};
      }
      const {rows:[merchant]} = await client.query(`SELECT m.organization_id,m.profile_id FROM pos_delivery_merchants m
        JOIN center_mollie_credentials c USING (restaurant_id,organization_id,profile_id)
        WHERE m.restaurant_id=$1 AND m.verified_at>now()-interval '24 hours'
        AND c.verified_at IS NOT NULL FOR SHARE OF m`,[cart.restaurantId]);
      if (!merchant) return {error:'Für diesen Standort fehlt die Mollie-Freigabe.'};
      const price = await priceDeliveryCart(client,cart);
      if (price.error) return {error:price.error};
      const items = cart.cart.map(({id,qty})=>{
        const product = price.byId.get(id);
        return {productId:id,name:product.name,cents:product.price_cents,taxRate:product.tax_rate,qty};
      });
      if (price.fee) items.push({name:'Liefergebühr (Test)',cents:price.fee,taxRate:0,qty:1});
      const customer = customerSession ? (await client.query(
        'SELECT customer_id FROM delivery_customer_sessions WHERE token_hash=$1 AND expires_at>now()',[customerSession]
      )).rows[0] : null;
      const {rows:[attempt]} = await client.query(`INSERT INTO pos_delivery_checkout_tests
        (id,restaurant_id,fingerprint,organization_id,profile_id,total_cents,items,delivery_address,payment_mode,customer_id)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [id,cart.restaurantId,fingerprint,merchant.organization_id,merchant.profile_id,price.totalCents,JSON.stringify(items),address,mode,customer?.customer_id ?? null]);
      return {attempt};
    });
    if (reservation.error) return send(409,{error:reservation.error});
    if (reservation.existing) {
      const url = reservation.existing.checkout_url;
      return send(url ? 200 : 202,url ? {checkoutUrl:url} : {status:'unconfirmed'});
    }

    const {attempt} = reservation;
    try {
      const checkoutUrl = await provider(attempt,async headers=>{
        const response = await mollieFetch('https://api.mollie.com/v2/payments',{
          method:'POST',
          headers:{...headers,'content-type':'application/json','idempotency-key':id},
          body:JSON.stringify({
            amount:{currency:'EUR',value:(attempt.total_cents/100).toFixed(2)},
            description:(live ? 'Bringness Bestellung ' : 'Bringness Testbestellung ')+id,
            profileId:attempt.profile_id,testmode:!live,
            metadata:{bringnessDeliveryCheckout:id},
            redirectUrl:new URL('/bestellen/#'+(live ? 'onlinezahlung=' : 'zahlung=')+id,origin).href,
            webhookUrl:new URL('/api/v1/delivery-portal/'+prefix+'payment-webhook',origin).href
          })
        },fetcher);
        if (!response.ok) throw Error('DELIVERY_PAYMENT_CREATE_FAILED');
        const payment = await response.json();
        validatePayment(payment,attempt);
        const target = new URL(payment._links?.checkout?.href);
        if (target.protocol!=='https:' || !['www.mollie.com','checkout.mollie.com','payment.mollie.com','mollie.com'].includes(target.hostname) ||
            target.username || target.password || target.port) throw Error('INVALID_CHECKOUT_URL');
        await db.query('UPDATE pos_delivery_checkout_tests SET payment_id=$2,checkout_url=$3 WHERE id=$1',[id,payment.id,target.href]);
        return target.href;
      });
      return send(201,{checkoutUrl});
    } catch {
      return send(202,{status:'unconfirmed'});
    }
  };
}
