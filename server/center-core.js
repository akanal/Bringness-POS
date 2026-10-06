import crypto from 'node:crypto';

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
    const user = raw && (await pool.query(`SELECT u.id,u.company_id,u.role FROM sessions s JOIN users u ON u.id=s.user_id
      WHERE s.token_hash=$1 AND s.expires_at>now() AND u.status='active' AND coalesce(u.must_change_password,false)=false`, [crypto.createHash('sha256').update(raw).digest('hex')])).rows[0];
    if (!user) return send(res, 401, {error: 'Nicht angemeldet'});
    if (!['owner', 'admin'].includes(user.role)) return send(res, 403, {error: 'Nur Besitzer können Center verwalten'});
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
    const match = p.match(/^\/api\/v1\/centers\/([0-9a-f-]{36})\/(tables|restaurants)$/i);
    if (!match || !uuid.test(match[1])) return send(res, 404, {error: 'Nicht gefunden'});
    const centerId = match[1];
    const owned = (await pool.query('SELECT id FROM centers WHERE id=$1 AND company_id=$2', [centerId, user.company_id])).rowCount;
    if (!owned) return send(res, 404, {error: 'Center nicht gefunden'});
    if (match[2] === 'tables') {
      if (req.method === 'GET') return send(res, 200, {tables: (await pool.query('SELECT id,name,qr_token,active FROM center_tables WHERE center_id=$1 ORDER BY name,id', [centerId])).rows});
      if (req.method !== 'POST') return send(res, 405, {error: 'Methode nicht erlaubt'});
      if (!name || name.length > 80) return send(res, 400, {error: 'Tischname erforderlich (maximal 80 Zeichen)'});
      const table = (await pool.query('INSERT INTO center_tables(center_id,name,qr_token) VALUES($1,$2,$3) RETURNING id,name,qr_token,active', [centerId, name, crypto.randomBytes(24).toString('hex')])).rows[0];
      return send(res, 201, {table});
    }
    if (req.method === 'GET') return send(res, 200, {restaurants: (await pool.query(`SELECT r.id,r.name,cr.active FROM center_restaurants cr JOIN restaurants r ON r.id=cr.restaurant_id WHERE cr.center_id=$1 ORDER BY r.name,r.id`, [centerId])).rows});
    if (req.method !== 'PUT') return send(res, 405, {error: 'Methode nicht erlaubt'});
    if (!uuid.test(b.restaurantId || '') || typeof b.active !== 'boolean') return send(res, 400, {error: 'Restaurant und Aktivstatus erforderlich'});
    // Cross-company enrollment requires an invitation/approval flow; never attach someone else's business.
    const restaurant = (await pool.query('SELECT id FROM restaurants WHERE id=$1 AND company_id=$2', [b.restaurantId, user.company_id])).rows[0];
    if (!restaurant) return send(res, 403, {error: 'Restaurant gehört nicht zu Ihrem Konto'});
    await pool.query(`INSERT INTO center_restaurants(center_id,restaurant_id,active) VALUES($1,$2,$3)
      ON CONFLICT(center_id,restaurant_id) DO UPDATE SET active=EXCLUDED.active`, [centerId, restaurant.id, b.active]);
    return send(res, 200, {ok: true});
  };
}
