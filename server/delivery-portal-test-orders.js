import {parseDeliveryCart,priceDeliveryCart} from './delivery-cart.js';
import {createHash} from 'node:crypto';
import {readJsonObject} from './http-body.js';

export async function migrateDeliveryTestOrders(db) {
  await db.query(`CREATE TABLE IF NOT EXISTS pos_delivery_test_requests (
    request_id uuid PRIMARY KEY,
    fingerprint text NOT NULL,
    order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE
  )`);
  await db.query('ALTER TABLE pos_delivery_test_requests ADD COLUMN IF NOT EXISTS estimated_arrival timestamptz');
}

export async function submitDeliveryTestOrder(db,req,send,idPattern,postcodePattern) {
  if (req.method !== 'POST') return send(405,{error:'Methode nicht erlaubt.'});
  let input;
  try { input = await readJsonObject(req,{maxBytes:8192}); }
  catch (error) {
    if (!error.status) throw error;
    return send(error.status,{error:error.message});
  }
  const {requestId} = input;
  const parsed = parseDeliveryCart(input,idPattern,postcodePattern);
  if (parsed.error) return send(400,parsed);
  if (typeof requestId!=='string' || !idPattern.test(requestId)) return send(400,{error:'Ungültige Vorgangskennung.'});
  const {restaurantId,postcode,mode,cart,expectedTotalCents} = parsed;
  const fingerprint = createHash('sha256').update(JSON.stringify({restaurantId,postcode,mode,cart,expectedTotalCents})).digest('hex');
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended(lower($1::text),0))',[requestId]);
    const existing = (await client.query(`SELECT t.fingerprint,o.id AS "orderId",o.total_cents AS "totalCents"
      FROM pos_delivery_test_requests t JOIN orders o ON o.id=t.order_id WHERE t.request_id=$1`,[requestId])).rows[0];
    if (existing) {
      await client.query('COMMIT');
      if (existing.fingerprint!==fingerprint) return send(409,{error:'Vorgangskennung gehört zu einem anderen Warenkorb.'});
      return send(200,{orderId:existing.orderId,totalCents:existing.totalCents});
    }

    const quote = await priceDeliveryCart(client,{restaurantId,postcode,mode,cart,expectedTotalCents});
    if (quote.error) {
      await client.query('ROLLBACK');
      return send(409,quote);
    }
    const {byId,fee,totalCents} = quote;
    const source = mode==='pickup' ? 'web_test_pickup' : 'web_test_delivery';
    const {id:orderId} = (await client.query(`INSERT INTO orders (restaurant_id,source,status,total_cents)
      VALUES ($1,$2,'open',$3) RETURNING id`,[restaurantId,source,totalCents])).rows[0];
    for (const {id,qty} of cart) {
      const product = byId.get(id);
      await client.query(`INSERT INTO order_items
        (order_id,product_id,product_name_snapshot,unit_price_cents,tax_rate_snapshot,quantity)
        VALUES ($1,$2,$3,$4,$5,$6)`,[orderId,id,product.name,product.price_cents,product.tax_rate,qty]);
    }
    if (fee) await client.query(`INSERT INTO order_items
      (order_id,product_name_snapshot,unit_price_cents,tax_rate_snapshot,quantity)
      VALUES ($1,'Liefergebühr (Test)',$2,0,1)`,[orderId,fee]);
    await client.query('INSERT INTO pos_delivery_test_requests (request_id,fingerprint,order_id) VALUES ($1,$2,$3)',[requestId,fingerprint,orderId]);
    await client.query('COMMIT');
    return send(201,{orderId,totalCents});
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function deliveryTestStatus(db,req,send,idPattern) {
  if (req.method !== 'GET') return send(405,{error:'Methode nicht erlaubt.'});
  const requestId = /^Bearer (\S+)$/i.exec(req.headers.authorization ?? '')?.[1];
  if (!idPattern.test(requestId ?? '')) return send(404,{error:'Testbestellung nicht gefunden.'});
  const {rows} = await db.query(`SELECT o.status,o.source,t.estimated_arrival FROM pos_delivery_test_requests t
    JOIN orders o ON o.id=t.order_id WHERE t.request_id=$1`,[requestId]);
  if (!rows.length) return send(404,{error:'Testbestellung nicht gefunden.'});
  return send(200,{status:rows[0].status,mode:rows[0].source==='web_test_delivery'?'delivery':'pickup',estimatedArrival:rows[0].estimated_arrival});
}

const fulfillment = {
  ready:{previous:'preparing',sources:['web_test_pickup','web_test_delivery']},
  dispatched:{previous:'ready',sources:['web_test_delivery']},
  collected:{previous:'ready',sources:['web_test_pickup']},
  delivered:{previous:'dispatched',sources:['web_test_delivery']}
};

export async function advanceDeliveryOrder(db,req,send,idPattern,{live=false}={}) {
  if (req.method !== 'POST') return send(405,{error:'Methode nicht erlaubt.'});
  const token = /^Bearer ([^\s]{1,512})$/i.exec(req.headers.authorization ?? '')?.[1];
  if (!token) return send(401,{error:'Bitte anmelden.'});
  let input;
  try { input = await readJsonObject(req,{maxBytes:1024}); }
  catch (error) {
    if (!error.status) throw error;
    return send(error.status,{error:error.message});
  }
  const {orderId,status,minutes} = input;
  if (!live && status === 'estimate') {
    if (typeof orderId !== 'string' || !idPattern.test(orderId) || !Number.isInteger(minutes) || minutes < 1 || minutes > 240) {
      return send(400,{error:'Bitte eine Lieferzeit von 1 bis 240 Minuten eingeben.'});
    }
    const hash = createHash('sha256').update(token).digest('hex');
    const {rows} = await db.query(`WITH eligible AS (
      SELECT o.id FROM orders o JOIN restaurants r ON r.id=o.restaurant_id
      WHERE o.id=$1 AND o.source='web_test_delivery'
        AND o.status IN ('open','kitchen','preparing','ready','dispatched')
        AND EXISTS (
          SELECT 1 FROM sessions s JOIN users u ON u.id=s.user_id
          WHERE s.token_hash=$3 AND s.expires_at>clock_timestamp() AND u.company_id=r.company_id
            AND u.status='active' AND u.role IN ('owner','admin','manager','kitchen')
            AND NOT coalesce(u.must_change_password,false)
        )
      FOR UPDATE OF o
    )
    UPDATE pos_delivery_test_requests t
    SET estimated_arrival=clock_timestamp()+make_interval(mins=>$2::int)
    FROM eligible WHERE t.order_id=eligible.id
    RETURNING t.estimated_arrival AS "estimatedArrival"`,[orderId,minutes,hash]);
    return rows.length ? send(200,rows[0]) : send(409,{error:'Lieferzeit für diese Bestellung nicht verfügbar.'});
  }
  if (typeof orderId !== 'string' || !idPattern.test(orderId) || !Object.hasOwn(fulfillment,status) || (live && !['ready','collected'].includes(status))) {
    return send(400,{error:'Ungültiger Bestellstatus.'});
  }
  const {previous,sources} = fulfillment[status];
  const paymentBinding = live
    ? `EXISTS (SELECT 1 FROM pos_delivery_checkout_tests t JOIN payments p ON p.order_id=t.order_id
        WHERE t.order_id=o.id AND t.restaurant_id=o.restaurant_id AND t.payment_mode='live'
          AND t.payment_id IS NOT NULL AND p.method='mollie_delivery' AND p.amount_cents=o.total_cents)`
    : 'EXISTS (SELECT 1 FROM pos_delivery_test_requests t WHERE t.order_id=o.id)';
  const hash = createHash('sha256').update(token).digest('hex');
  const {rows} = await db.query(`UPDATE orders o SET status=$2,
    closed_at=CASE WHEN $2 IN ('collected','delivered') THEN coalesce(o.closed_at,now()) ELSE o.closed_at END
    FROM restaurants r
    WHERE o.id=$1 AND r.id=o.restaurant_id AND ${paymentBinding} AND o.source=ANY($3::text[])
      AND o.status IN ($4,$2) AND EXISTS (
        SELECT 1 FROM sessions s JOIN users u ON u.id=s.user_id
        WHERE s.token_hash=$5 AND s.expires_at>clock_timestamp() AND u.company_id=r.company_id
          AND u.status='active' AND u.role IN ('owner','admin','manager','kitchen')
          AND NOT coalesce(u.must_change_password,false)
      )
    RETURNING o.status`,[orderId,status,live ? ['web_pickup'] : sources,previous,hash]);
  return rows.length ? send(200,rows[0]) : send(409,{error:'Statuswechsel für diese Bestellung nicht verfügbar.'});
}
