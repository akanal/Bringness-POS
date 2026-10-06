import crypto from 'node:crypto';
import {centerKitchenQueue} from './center-payment-release.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const token = /^[a-f0-9]{48}$/;
const send = (res, status, data) => {
  res.writeHead(status, {'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store'});
  res.end(JSON.stringify(data));
  return true;
};
async function body(req) {
  let raw = '';
  for await (const part of req) {
    raw += part;
    if (Buffer.byteLength(raw) > 8192) throw new Error('BODY_LIMIT');
  }
  return raw ? JSON.parse(raw) : {};
}
export function createCenterHandler(pool) {
  return async (req, res) => {
    const url = new URL(req.url, 'http://local');
    const p = url.pathname;
    const guest = p.startsWith('/api/v1/guest/center/');
    if (!guest && p !== '/api/v1/centers' && !p.startsWith('/api/v1/centers/')) return false;
    if (guest) {
      if (p === '/api/v1/guest/center/order') {
        // Never reuse the unpaid restaurant-order endpoint for center checkout.
        return send(res, 503, {error: 'Online-Zahlung für diesen Center-Betrieb ist noch nicht eingerichtet.'});
      }
      if (req.method !== 'GET') return send(res, 405, {error: 'Methode nicht erlaubt'});
      const code = url.searchParams.get('code') || '';
      if (!token.test(code)) return send(res, 404, {error: 'Center-Code ungültig'});
      const table = (await pool.query(`SELECT t.id,t.name,c.id center_id,c.name center_name
        FROM center_tables t JOIN centers c ON c.id=t.center_id
        WHERE t.qr_token=$1 AND t.active=true AND c.active=true`, [code])).rows[0];
      if (!table) return send(res, 404, {error: 'Center-Code ungültig'});
      const restaurantId = url.searchParams.get('restaurantId');
      if (p === '/api/v1/guest/center/restaurants') {
        const restaurants = (await pool.query(`SELECT r.id,r.name,r.logo_data
          FROM center_restaurants cr JOIN restaurants r ON r.id=cr.restaurant_id
          WHERE cr.center_id=$1 AND cr.active=true ORDER BY r.name,r.id`, [table.center_id])).rows;
        return send(res, 200, {center: table.center_name, table: table.name, restaurants, orderingAvailable: false});
      }
      if (p !== '/api/v1/guest/center/menu') return send(res, 404, {error: 'Nicht gefunden'});
      if (!uuid.test(restaurantId || '')) return send(res, 404, {error: 'Restaurant nicht gefunden'});
      const restaurant = (await pool.query(`SELECT r.id,r.name,r.logo_data FROM center_restaurants cr
        JOIN restaurants r ON r.id=cr.restaurant_id
        WHERE cr.center_id=$1 AND cr.restaurant_id=$2 AND cr.active=true`, [table.center_id, restaurantId])).rows[0];
      if (!restaurant) return send(res, 404, {error: 'Restaurant nicht gefunden'});
      const lang = String(url.searchParams.get('lang') || 'de').toLowerCase().split('-')[0];
      const products = (await pool.query(`SELECT p.id,p.name,coalesce(pt.description,p.description) description,
        pt.ingredients,p.price_cents,c.name category,
        coalesce((SELECT json_agg(json_build_object('code',a.code,'name',a.name_de)) FROM product_allergens pa JOIN allergen_catalog a ON a.code=pa.code WHERE pa.product_id=p.id),'[]'::json) allergens,
        coalesce((SELECT json_agg(json_build_object('code',a.code,'name',a.name_de)) FROM product_additives pa JOIN additive_catalog a ON a.code=pa.code WHERE pa.product_id=p.id),'[]'::json) additives
        FROM products p LEFT JOIN categories c ON c.id=p.category_id
        LEFT JOIN product_translations pt ON pt.product_id=p.id AND pt.language_code=$2
        WHERE p.restaurant_id=$1 AND p.active=true ORDER BY c.sort_order,p.name,p.id`, [restaurantId, /^[a-z]{2,3}$/.test(lang) ? lang : 'de'])).rows;
      return send(res, 200, {center: table.center_name, table: table.name, restaurant, products, orderingAvailable: false});
    }
    const raw = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const user = raw && (await pool.query(`SELECT u.id,u.company_id,u.role,
      EXISTS(SELECT 1 FROM platform_admins pa WHERE pa.user_id=u.id AND pa.active=true) platform_admin FROM sessions s JOIN users u ON u.id=s.user_id
      WHERE s.token_hash=$1 AND s.expires_at>now() AND u.status='active' AND coalesce(u.must_change_password,false)=false`, [crypto.createHash('sha256').update(raw).digest('hex')])).rows[0];
    if (!user) return send(res, 401, {error: 'Nicht angemeldet'});
    if (p === '/api/v1/centers/kitchen') {
      if (req.method !== 'GET') return send(res,405,{error:'Methode nicht erlaubt'});
      const restaurantId=url.searchParams.get('restaurantId');
      if(!uuid.test(restaurantId || ''))return send(res,400,{error:'Restaurant erforderlich'});
      const allowed=(await pool.query(`SELECT r.id FROM restaurants r WHERE r.id=$1 AND r.company_id=$2
        AND ($3 IN ('owner','admin') OR EXISTS(SELECT 1 FROM employees e WHERE e.restaurant_id=r.id
          AND e.user_id=$4 AND e.active=true AND e.role='kitchen'))`,[restaurantId,user.company_id,user.role,user.id])).rows[0];
      if(!allowed)return send(res,403,{error:'Kein Küchenzugang für diesen Betrieb'});
      return send(res,200,{orders:await centerKitchenQueue(pool,restaurantId)});
    }
    if (!user.platform_admin && !['owner', 'admin'].includes(user.role)) return send(res, 403, {error: 'Nur Besitzer können Center verwalten'});
    if (p === '/api/v1/centers' && req.method === 'GET') {
      return send(res, 200, {centers: (await pool.query('SELECT id,name,active FROM centers WHERE company_id=$1 ORDER BY name,id', [user.company_id])).rows});
    }
    let b = {};
    if (['POST', 'PUT'].includes(req.method)) {
      try { b = await body(req); } catch { return send(res, 400, {error: 'Ungültige Eingabe'}); }
    }
    const name = String(b.name || '').trim();
    if (p === '/api/v1/centers' && req.method === 'POST') {
      if (!name || name.length > 120) return send(res, 400, {error: 'Centername erforderlich (maximal 120 Zeichen)'});
      const center = (await pool.query('INSERT INTO centers(company_id,name) VALUES($1,$2) RETURNING id,name,active', [user.company_id, name])).rows[0];
      return send(res, 201, {center});
    }
    const onboarding = p.match(/^\/api\/v1\/centers\/([0-9a-f-]{36})\/restaurants\/([0-9a-f-]{36})\/onboarding$/i);
    if (onboarding) {
      if (!uuid.test(onboarding[1]) || !uuid.test(onboarding[2])) return send(res, 404, {error: 'Nicht gefunden'});
      if (req.method !== 'PUT') return send(res, 405, {error: 'Methode nicht erlaubt'});
      if (!['pending','signed','suspended'].includes(b.contractStatus) || typeof b.merchantReference !== 'string' || b.merchantReference.length > 120) return send(res, 400, {error: 'Vertragsstatus und Händlerreferenz erforderlich'});
      if ('paymentStatus' in b) return send(res, 400, {error: 'Zahlungsbestätigung kann nur vom Zahlungsanbieter erfolgen'});
      const reference = b.merchantReference.trim();
      if (reference && !/^[a-zA-Z0-9_.:-]+$/.test(reference)) return send(res, 400, {error: 'Nur eine Händlerreferenz eingeben, keine Zugangsdaten'});
      if (/^(test_|live_|sk_|Bearer)/i.test(reference)) return send(res, 400, {error: 'Keine API-Schlüssel oder Zugangsdaten eingeben'});
      const q = await pool.query(`UPDATE center_restaurants cr SET contract_status=$4,merchant_reference=$5,
        payment_status=CASE WHEN cr.merchant_reference IS DISTINCT FROM $5 THEN CASE WHEN $5::text IS NULL THEN 'not_connected' ELSE 'pending' END ELSE cr.payment_status END
        FROM centers c,restaurants r WHERE cr.center_id=c.id AND cr.restaurant_id=r.id
        AND c.id=$1 AND r.id=$2 AND c.company_id=$3 AND r.company_id=$3
        RETURNING cr.contract_status,cr.payment_status,cr.merchant_reference`, [onboarding[1],onboarding[2],user.company_id,b.contractStatus,reference||null]);
      return q.rowCount ? send(res,200,{onboarding:q.rows[0],orderingAvailable:false}) : send(res,404,{error:'Center-Restaurant nicht gefunden'});
    }
    const setup = p.match(/^\/api\/v1\/centers\/([0-9a-f-]{36})\/setup$/i);
    if (setup && uuid.test(setup[1])) {
      if (req.method === 'GET') {
        const state = (await pool.query(`SELECT setup_completed_at,
          ($3::boolean OR setup_user_id=$4) can_setup FROM centers
          WHERE id=$1 AND company_id=$2`, [setup[1],user.company_id,!!user.platform_admin,user.id])).rows[0];
        return state ? send(res,200,{setup:state,canApprove:!!user.platform_admin}) : send(res,404,{error:'Center nicht gefunden'});
      }
      if (req.method !== 'PUT') return send(res,405,{error:'Methode nicht erlaubt'});
      if (b.action === 'approve') {
        if (!user.platform_admin) return send(res,403,{error:'Nur der Superadmin kann die Ersteinrichtung freigeben'});
        if (!uuid.test(b.userId || '') || !uuid.test(b.restaurantId || '')) return send(res,400,{error:'Restaurant und Benutzer erforderlich'});
        const q = await pool.query(`UPDATE centers c SET setup_user_id=$3,setup_approved_by=$5,setup_approved_at=now()
          WHERE c.id=$1 AND c.company_id=$2 AND c.setup_completed_at IS NULL
          AND c.setup_approved_at IS NULL
          AND $4::uuid=(SELECT cr.restaurant_id FROM center_restaurants cr WHERE cr.center_id=c.id ORDER BY cr.enrolled_at,cr.restaurant_id LIMIT 1)
          AND EXISTS(SELECT 1 FROM center_restaurants cr JOIN restaurants r ON r.id=cr.restaurant_id
            JOIN users u ON u.company_id=r.company_id WHERE cr.center_id=c.id AND cr.restaurant_id=$4
            AND cr.active=true AND u.id=$3 AND u.status='active' AND u.role IN ('owner','admin') AND u.company_id=$2)
          RETURNING setup_approved_at`, [setup[1],user.company_id,b.userId,b.restaurantId,user.id]);
        return q.rowCount ? send(res,200,{ok:true}) : send(res,409,{error:'Ersteinrichtung nicht freigebbar: erstes Restaurant und berechtigten Benutzer prüfen'});
      }
      if (b.action === 'complete') {
        const q = await pool.query(`UPDATE centers c SET setup_completed_at=now()
          WHERE c.id=$1 AND c.company_id=$2 AND c.setup_completed_at IS NULL
          AND ($3::boolean OR c.setup_user_id=$4)
          AND EXISTS(SELECT 1 FROM center_tables t WHERE t.center_id=c.id AND t.active=true)
          RETURNING setup_completed_at`, [setup[1],user.company_id,!!user.platform_admin,user.id]);
        return q.rowCount ? send(res,200,{ok:true}) : send(res,409,{error:'Einrichtung nicht abschließbar oder bereits gesperrt'});
      }
      return send(res,400,{error:'Unbekannte Einrichtungsaktion'});
    }
    const match = p.match(/^\/api\/v1\/centers\/([0-9a-f-]{36})\/(tables|restaurants)$/i);
    if (!match || !uuid.test(match[1])) return send(res, 404, {error: 'Nicht gefunden'});
    const centerId = match[1];
    const owned = (await pool.query('SELECT id FROM centers WHERE id=$1 AND company_id=$2', [centerId, user.company_id])).rowCount;
    if (!owned) return send(res, 404, {error: 'Center nicht gefunden'});
    if (match[2] === 'tables') {
      if (req.method === 'GET') return send(res, 200, {tables: (await pool.query('SELECT id,name,qr_token,active FROM center_tables WHERE center_id=$1 ORDER BY name,id', [centerId])).rows});
      if (req.method !== 'POST') return send(res, 405, {error: 'Methode nicht erlaubt'});
      if (!name || name.length > 80) return send(res, 400, {error: 'Tischname erforderlich (maximal 80 Zeichen)'});
      const table = (await pool.query(`WITH allowed AS (
        SELECT id FROM centers WHERE id=$1 AND company_id=$4
        AND ($5::boolean OR (setup_user_id=$6 AND setup_completed_at IS NULL)) FOR UPDATE
      ) INSERT INTO center_tables(center_id,name,qr_token) SELECT id,$2,$3 FROM allowed
      RETURNING id,name,qr_token,active`, [centerId, name, crypto.randomBytes(24).toString('hex'),user.company_id,!!user.platform_admin,user.id])).rows[0];
      if (!table) return send(res,403,{error:'Tischverwaltung gesperrt oder Ersteinrichtung nicht freigegeben'});
      return send(res, 201, {table});
    }
    if (req.method === 'GET') return send(res, 200, {restaurants: (await pool.query(`SELECT r.id,r.name,cr.active,cr.contract_status,cr.payment_status,cr.merchant_reference FROM center_restaurants cr JOIN restaurants r ON r.id=cr.restaurant_id WHERE cr.center_id=$1 ORDER BY r.name,r.id`, [centerId])).rows});
    if (req.method !== 'PUT') return send(res, 405, {error: 'Methode nicht erlaubt'});
    if (!uuid.test(b.restaurantId || '') || typeof b.active !== 'boolean') return send(res, 400, {error: 'Restaurant und Aktivstatus erforderlich'});
    // Cross-company enrollment requires an invitation/approval flow; never attach someone else's business.
    const restaurant = (await pool.query('SELECT id FROM restaurants WHERE id=$1 AND company_id=$2', [b.restaurantId, user.company_id])).rows[0];
    if (!restaurant) return send(res, 403, {error: 'Restaurant gehört nicht zu Ihrem Konto'});
    try {
      await pool.query(`INSERT INTO center_restaurants(center_id,restaurant_id,active) VALUES($1,$2,$3)
        ON CONFLICT(center_id,restaurant_id) DO UPDATE SET active=EXCLUDED.active`, [centerId, restaurant.id, b.active]);
    } catch (error) {
      if (error.code === '23505') return send(res,409,{error:'Dieses Restaurant ist bereits einem anderen Center zugeordnet.'});
      throw error;
    }
    return send(res, 200, {ok: true});
  };
}
