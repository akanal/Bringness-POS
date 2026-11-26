import {createDeliveryCheckout,migrateDeliveryCheckout} from './delivery-checkout.js';
import {createDeliveryQuote} from './delivery-quote.js';
import {createDeliveryMerchant,migrateDeliveryMerchant} from './delivery-merchant.js';
import {migrateDeliveryTestOrders,submitDeliveryTestOrder,deliveryTestStatus,advanceDeliveryOrder} from './delivery-portal-test-orders.js';
import {createHash} from 'node:crypto';
import {readJsonObject} from './http-body.js';

const postcodePattern = /^\d{5}$/;
const idPattern = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const defaults = {pickup:false, delivery:false, postcode:'', zones:[], minutes:30, feeCents:0, minimumCents:0, productIds:[]};
const integerBetween = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;

export async function migrateDeliveryPortal(db,{testOrders=false,liveCheckout=false}={}) {
  await db.query(`CREATE TABLE IF NOT EXISTS pos_delivery_locations (
    restaurant_id uuid PRIMARY KEY REFERENCES restaurants(id) ON DELETE CASCADE,
    settings jsonb NOT NULL
  )`);
  await migrateDeliveryMerchant(db);
  if (testOrders) {
    await migrateDeliveryTestOrders(db);
  }
  if (testOrders || liveCheckout) await migrateDeliveryCheckout(db);
}

export function createDeliveryPortal(db,{testOrders=false,sandbox,liveCheckoutOrigin,liveRestaurantId}={}) {
  const access = `SELECT r.id FROM restaurants r JOIN users u ON u.company_id=r.company_id
      JOIN sessions s ON s.user_id=u.id WHERE r.id=$1 AND s.token_hash=$2
      AND s.expires_at>clock_timestamp() AND u.status='active' AND u.role IN ('owner','admin')
      AND NOT coalesce(u.must_change_password,false)`;
  const merchant = createDeliveryMerchant(db,{access});
  const quote = createDeliveryQuote(db,{idPattern,postcodePattern});
  function checkoutOriginUrl(value) {
    if (!value) return null;
    const url = new URL(value);
    if (url.protocol!=='https:' || url.href!==url.origin+'/') throw Error('Ungültige Checkout-Origin.');
    return url;
  }
  const origin = checkoutOriginUrl(sandbox?.origin);
  const liveOrigin = checkoutOriginUrl(liveCheckoutOrigin);
  const checkout = createDeliveryCheckout(db,{idPattern,postcodePattern,origin,sandboxRestaurantId:sandbox?.restaurantId});
  const liveCheckout = liveOrigin && createDeliveryCheckout(db,{
    idPattern,postcodePattern,origin:liveOrigin,liveRestaurantId,mode:'live'
  });
  return async (req,res) => {
    const url = new URL(req.url,'http://localhost');
    const owner = url.pathname === '/api/v1/pos/delivery-portal';
    const onlineAction = {
      '/api/v1/delivery-portal/checkout':'start',
      '/api/v1/delivery-portal/payment-status':'status',
      '/api/v1/delivery-portal/payment-webhook':'webhook'
    }[url.pathname];
    const checkoutStart = url.pathname === '/api/v1/delivery-portal/test-checkout';
    const checkoutWebhook = url.pathname === '/api/v1/delivery-portal/test-payment-webhook';
    const checkoutStatus = url.pathname === '/api/v1/delivery-portal/test-payment-status';
    const checkoutQuote = url.pathname === '/api/v1/delivery-portal/checkout-quote';
    const menu = url.pathname === '/api/v1/delivery-portal/menu';
    const order = url.pathname === '/api/v1/delivery-portal/test-order';
    const status = url.pathname === '/api/v1/delivery-portal/test-status';
    const advancePickup = url.pathname === '/api/v1/pos/delivery-portal/pickup-status';
    const advance = url.pathname === '/api/v1/pos/delivery-portal/test-status';
    const merchantRoute = url.pathname === '/api/v1/pos/delivery-portal/merchant';
    if (!owner && !onlineAction && !merchantRoute && !checkoutQuote && !checkoutStart && !checkoutStatus && !checkoutWebhook && !menu && !order && !status && !advance && !advancePickup && url.pathname !== '/api/v1/delivery-portal/restaurants') return false;
    const send = (status,data) => {
      res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});
      res.end(JSON.stringify(data));
      return true;
    };

    if (onlineAction) return liveCheckout
      ? liveCheckout(req,send,onlineAction)
      : send(404,{error:'Onlinezahlung ist hier nicht verfügbar.'});

    if (checkoutStart || checkoutStatus || checkoutWebhook) {
      if (!origin || req.headers.host?.toLowerCase()!==origin.host) {
        return send(404,{error:'Mollie-Testzahlung ist hier nicht verfügbar.'});
      }
      return checkout(req,send,checkoutWebhook ? 'webhook' : checkoutStatus ? 'status' : 'start');
    }
    if (advancePickup) return liveCheckout
      ? advanceDeliveryOrder(db,req,send,idPattern,{live:true})
      : send(404,{error:'Online-Abholung ist hier nicht verfügbar.'});
    if (checkoutQuote) return quote(req,send);
    if (order || status || advance) {
      if (!testOrders || (sandbox && (order || req.headers.host?.toLowerCase()!==origin.host))) return send(404,{error:'Testbestellungen sind hier nicht verfügbar.'});
      if (status) return deliveryTestStatus(db,req,send,idPattern);
      if (advance) return advanceDeliveryOrder(db,req,send,idPattern);
      return submitDeliveryTestOrder(db,req,send,idPattern,postcodePattern);
    }
    if (!owner && !merchantRoute) {
      if (req.method !== 'GET') return send(405,{error:'Methode nicht erlaubt.'});
      const postcode = url.searchParams.get('postcode');
      const mode = url.searchParams.get('mode');
      if (!postcodePattern.test(postcode ?? '') || !['pickup','delivery'].includes(mode)) return send(400,{error:'Bitte Postleitzahl und Bestellart prüfen.'});
      const eligible = `(($2='pickup' AND s.settings->'pickup'='true' AND s.settings->>'postcode'=$1)
        OR ($2='delivery' AND s.settings->'delivery'='true' AND (s.settings->'zones') ? $1))`;
      if (menu) {
        const rid = url.searchParams.get('restaurantId');
        if (!idPattern.test(rid ?? '')) return send(400,{error:'Bitte ein Restaurant auswählen.'});
        const {rows} = await db.query(`SELECT p.id,p.name,p.price_cents AS cents
          FROM pos_delivery_locations s JOIN products p ON p.restaurant_id=s.restaurant_id
          LEFT JOIN categories c ON c.id=p.category_id AND c.restaurant_id=p.restaurant_id
          WHERE s.restaurant_id=$3 AND ${eligible} AND s.settings->'productIds' ? p.id::text
            AND p.active AND (p.category_id IS NULL OR c.active)
            AND coalesce((to_jsonb(p)->>'ai_stock_available')::boolean,true)
          ORDER BY c.sort_order NULLS LAST,p.name,p.id LIMIT 250`,[postcode,mode,rid]);
        let onlinePickup = false;
        let mollieTestCheckout = false;
        const sandboxMenu = sandbox && req.headers.host?.toLowerCase()===origin.host &&
          rid.toLowerCase()===sandbox.restaurantId.toLowerCase();
        if (rows.length && (sandboxMenu || (liveCheckout && mode==='pickup' && rid.toLowerCase()===liveRestaurantId.toLowerCase()))) {
          const {rows:verified} = await db.query(`SELECT 1 FROM pos_delivery_merchants m
            JOIN center_mollie_credentials c USING (restaurant_id,organization_id,profile_id)
            WHERE m.restaurant_id=$1 AND m.verified_at>now()-interval '24 hours'
              AND c.verified_at IS NOT NULL AND c.expires_at>now()`,[rid]);
          onlinePickup = !sandboxMenu && Boolean(verified.length);
          mollieTestCheckout = Boolean(sandboxMenu && verified.length);
        }
        return send(200,{
          menu:rows,testOrders:sandbox ? mollieTestCheckout : testOrders,mollieTestCheckout,onlinePickup,
          ...(sandboxMenu && rows.length && !mollieTestCheckout ? {basketPreview:true} : {})
        });
      }
      const {rows} = await db.query(`SELECT r.id,r.name,s.settings->>'minutes' AS minutes,
        CASE WHEN $2='delivery' THEN (s.settings->>'feeCents')::int END AS "feeCents",
        CASE WHEN $2='delivery' THEN (s.settings->>'minimumCents')::int END AS "minimumCents"
        FROM pos_delivery_locations s JOIN restaurants r ON r.id=s.restaurant_id
        WHERE ${eligible}
        ORDER BY r.name,r.id LIMIT 100`,[postcode,mode]);
      return send(200,{restaurants:rows});
    }

    if (!merchantRoute && !['GET','PUT'].includes(req.method)) return send(405,{error:'Methode nicht erlaubt.'});
    const rid = url.searchParams.get('restaurantId');
    if (!idPattern.test(rid ?? '')) return send(400,{error:'Bitte einen Betrieb auswählen.'});
    const token = /^Bearer ([^\s]{1,512})$/i.exec(req.headers.authorization ?? '')?.[1];
    if (!token) return send(401,{error:'Bitte anmelden.'});
    const hash = createHash('sha256').update(token).digest('hex');
    if (merchantRoute) {
      const sandboxRequest = origin && req.headers.host?.toLowerCase() === origin.host &&
        rid.toLowerCase() === sandbox.restaurantId.toLowerCase();
      if (origin && !sandboxRequest) return send(404,{error:'Mollie-Testprofil ist hier nicht verfügbar.'});
      return merchant(req,send,rid,hash,{testMode:Boolean(sandboxRequest)});
    }
    if (req.method === 'GET') {
      const {rows} = await db.query(`SELECT p.settings FROM (${access}) a
        LEFT JOIN pos_delivery_locations p ON p.restaurant_id=a.id`,[rid,hash]);
      if (!rows.length) return send(403,{error:'Kein Zugriff auf diesen Standort.'});
      const products = await db.query(`SELECT p.id,p.name,p.active FROM (${access}) a
        JOIN products p ON p.restaurant_id=a.id ORDER BY p.active DESC,p.name,p.id`,[rid,hash]);
      return send(200,{settings:{...defaults,...rows[0].settings},products:products.rows});
    }

    let input;
    try { input = await readJsonObject(req,{maxBytes:16384}); }
    catch (error) {
      if (!error.status) throw error;
      return send(error.status,{error:error.message});
    }
    const {pickup,delivery,postcode,zones,minutes,feeCents,minimumCents,productIds=[]} = input;
    if (typeof pickup !== 'boolean' || typeof delivery !== 'boolean' ||
      typeof postcode !== 'string' || ((pickup || postcode) && !postcodePattern.test(postcode)) ||
      !Array.isArray(zones) || zones.length > 100 || (delivery && !zones.length) ||
      !Array.isArray(productIds) || productIds.length > 250 || productIds.some(id => typeof id !== 'string' || !idPattern.test(id)) ||
      zones.some(zone => typeof zone !== 'string' || !postcodePattern.test(zone)) ||
      !integerBetween(minutes,1,240) || !integerBetween(feeCents,0,10000) || !integerBetween(minimumCents,0,100000)) {
      return send(400,{error:'Bitte Postleitzahlen, Zeit und Beträge prüfen.'});
    }
    const settings = {pickup,delivery,postcode,zones:[...new Set(zones)],minutes,feeCents,minimumCents,productIds:[...new Set(productIds.map(id=>id.toLowerCase()))]};
    const {rows} = await db.query(`INSERT INTO pos_delivery_locations (restaurant_id,settings)
      SELECT a.id,$3::jsonb FROM (${access}) a
      WHERE NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements_text($3::jsonb->'productIds') AS selected(id)
        WHERE NOT EXISTS (SELECT 1 FROM products p WHERE p.restaurant_id=a.id AND p.id=selected.id::uuid)
      )
      ON CONFLICT (restaurant_id) DO UPDATE SET settings=EXCLUDED.settings RETURNING settings`,[rid,hash,JSON.stringify(settings)]);
    return rows.length ? send(200,{settings:rows[0].settings}) : send(403,{error:'Kein Zugriff auf diesen Standort.'});
  };
}
