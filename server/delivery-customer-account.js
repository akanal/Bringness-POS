import {createHash,randomBytes} from 'node:crypto';
import {readJsonObject} from './http-body.js';
import {cleanMailAddress,enqueueMail} from './transactional-mail.js';

const hash = value => createHash('sha256').update(value).digest('hex');
const secret = () => randomBytes(32).toString('hex');
const tokenPattern = /^[a-f0-9]{64}$/;
const cookieName = '__Host-bringness-customer';
const sessionDays = 30;

function customerSessionCookie(req) {
  return (req.headers.cookie ?? '').split(';').map(value=>value.trim())
    .find(value=>value.startsWith(cookieName+'='))?.slice(cookieName.length+1);
}

export function customerSessionHash(req) {
  const token = customerSessionCookie(req);
  return tokenPattern.test(token ?? '') ? hash(token) : null;
}

export async function migrateDeliveryCustomerAccounts(db) {
  await db.query(`CREATE TABLE IF NOT EXISTS delivery_customer_accounts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email text NOT NULL UNIQUE CHECK (email = lower(btrim(email))),
    created_at timestamptz NOT NULL DEFAULT now()
  )`);
  await db.query(`CREATE TABLE IF NOT EXISTS delivery_customer_login_links (
    email text PRIMARY KEY,
    token_hash text NOT NULL UNIQUE,
    expires_at timestamptz NOT NULL,
    requested_at timestamptz NOT NULL DEFAULT now()
  )`);
  await db.query(`CREATE TABLE IF NOT EXISTS delivery_customer_sessions (
    token_hash text PRIMARY KEY,
    customer_id uuid NOT NULL REFERENCES delivery_customer_accounts(id) ON DELETE CASCADE,
    expires_at timestamptz NOT NULL
  )`);
  await db.query(`CREATE TABLE IF NOT EXISTS delivery_customer_addresses (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id uuid NOT NULL REFERENCES delivery_customer_accounts(id) ON DELETE CASCADE,
    label text NOT NULL,
    recipient text NOT NULL,
    street text NOT NULL,
    postcode text NOT NULL CHECK (postcode ~ '^[0-9]{5}$'),
    city text NOT NULL
  )`);
  await db.query(`CREATE INDEX IF NOT EXISTS delivery_customer_addresses_account_idx
    ON delivery_customer_addresses(customer_id)`);
  await db.query(`CREATE TABLE IF NOT EXISTS delivery_customer_favorites (
    customer_id uuid NOT NULL REFERENCES delivery_customer_accounts(id) ON DELETE CASCADE,
    restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    PRIMARY KEY (customer_id,restaurant_id)
  )`);
}

export async function handleDeliveryCustomerAccount(db,req,res,send,action,origin) {
  if (!origin || req.headers.host?.toLowerCase() !== origin.host) return send(404,{error:'Kundenkonto hier nicht verfügbar.'});
  const current = customerSessionCookie(req);
  if (action === 'orders') {
    if (req.method !== 'GET') return send(405,{error:'Methode nicht erlaubt.'});
    const session = customerSessionHash(req);
    if (!session) return send(401,{error:'Bitte anmelden.'});
    const {rows:[result]} = await db.query(`SELECT ARRAY(
      SELECT json_build_object('restaurant',r.name,'totalCents',o.total_cents,'status',o.status,
        'estimatedArrival',CASE WHEN o.status IN ('open','kitchen','preparing','ready','dispatched') THEN t.estimated_arrival END,
        'items',(SELECT json_agg(json_build_object('name',item->>'name','quantity',item->'qty') ORDER BY ordinal)
          FROM jsonb_array_elements(c.items) WITH ORDINALITY AS line(item,ordinal) WHERE item ? 'productId'),
        'date',o.delivery_test_paid_at,'mode',CASE WHEN c.delivery_address IS NULL THEN 'pickup' ELSE 'delivery' END)
      FROM pos_delivery_checkout_tests c JOIN orders o ON o.id=c.order_id
      JOIN restaurants r ON r.id=c.restaurant_id
      LEFT JOIN pos_delivery_test_requests t ON t.request_id=c.id AND t.order_id=o.id
      WHERE c.customer_id=s.customer_id AND c.payment_mode='test'
      ORDER BY o.delivery_test_paid_at DESC NULLS LAST,o.id DESC LIMIT 25
    ) AS orders FROM delivery_customer_sessions s WHERE s.token_hash=$1 AND s.expires_at>now()`,[session]);
    return result ? send(200,result) : send(401,{error:'Bitte anmelden.'});
  }
  if (action === 'addresses') {
    if (!tokenPattern.test(current ?? '')) return send(401,{error:'Bitte anmelden.'});
    if (!['GET','POST'].includes(req.method)) return send(405,{error:'Methode nicht erlaubt.'});
    const session = hash(current);
    const account = 'SELECT customer_id FROM delivery_customer_sessions WHERE token_hash=$1 AND expires_at>now()';
    if (req.method === 'POST') {
      if (req.headers.origin !== origin.origin) return send(403,{error:'Anfrage nicht erlaubt.'});
      let input;
      try { input = await readJsonObject(req,{maxBytes:2048}); }
      catch (error) { if (!error.status) throw error; return send(error.status,{error:error.message}); }
      if (input.remove === true) {
        if (typeof input.id !== 'string' || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(input.id)) return send(400,{error:'Ungültige Adresse.'});
        await db.query(`DELETE FROM delivery_customer_addresses WHERE customer_id=(${account}) AND id=$2`,[session,input.id]);
      } else {
        const limits = {label:40,recipient:100,street:140,postcode:5,city:100};
        const values = Object.keys(limits).map(key=>typeof input[key] === 'string' ? input[key].trim() : '');
        if (values.some((value,index)=>!value || value.length>Object.values(limits)[index] || /[\u0000-\u001f]/.test(value)) ||
            !/^\d{5}$/.test(values[3])) return send(400,{error:'Bitte die Lieferadresse prüfen.'});
        await db.query(`INSERT INTO delivery_customer_addresses (customer_id,label,recipient,street,postcode,city)
          SELECT customer_id,$2,$3,$4,$5,$6 FROM (${account}) a`,[session,...values]);
      }
    }
    const {rows:[result]} = await db.query(`SELECT coalesce(json_agg(json_build_object(
      'id',d.id,'label',d.label,'recipient',d.recipient,'street',d.street,'postcode',d.postcode,'city',d.city)
      ORDER BY d.label,d.id) FILTER (WHERE d.id IS NOT NULL),'[]') AS addresses
      FROM (${account}) a LEFT JOIN delivery_customer_addresses d ON d.customer_id=a.customer_id GROUP BY a.customer_id`,[session]);
    return result ? send(200,result) : send(401,{error:'Bitte anmelden.'});
  }
  if (action === 'favorites') {
    if (!tokenPattern.test(current ?? '')) return send(401,{error:'Bitte anmelden.'});
    if (!['GET','POST'].includes(req.method)) return send(405,{error:'Methode nicht erlaubt.'});
    const session = hash(current);
    const account = 'SELECT customer_id FROM delivery_customer_sessions WHERE token_hash=$1 AND expires_at>now()';
    if (req.method === 'POST') {
      if (req.headers.origin !== origin.origin) return send(403,{error:'Anfrage nicht erlaubt.'});
      let input;
      try { input = await readJsonObject(req,{maxBytes:1024}); }
      catch (error) { if (!error.status) throw error; return send(error.status,{error:error.message}); }
      const {restaurantId,saved} = input;
      if (typeof restaurantId !== 'string' || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(restaurantId) || typeof saved !== 'boolean') {
        return send(400,{error:'Ungültiger Favorit.'});
      }
      await db.query(saved
        ? `INSERT INTO delivery_customer_favorites (customer_id,restaurant_id)
           SELECT a.customer_id,r.restaurant_id FROM (${account}) a CROSS JOIN pos_delivery_locations r
           WHERE r.restaurant_id=$2 ON CONFLICT DO NOTHING`
        : `DELETE FROM delivery_customer_favorites WHERE customer_id=(${account}) AND restaurant_id=$2`,
        [session,restaurantId]);
    }
    const {rows:[result]} = await db.query(`SELECT coalesce(json_agg(json_build_object('id',r.id,'name',r.name)
      ORDER BY r.name,r.id) FILTER (WHERE r.id IS NOT NULL),'[]') AS favorites
      FROM (${account}) a LEFT JOIN delivery_customer_favorites f ON f.customer_id=a.customer_id
      LEFT JOIN restaurants r ON r.id=f.restaurant_id GROUP BY a.customer_id`,[session]);
    return result ? send(200,result) : send(401,{error:'Bitte anmelden.'});
  }
  if (action === 'session' && req.method === 'GET') {
    if (!tokenPattern.test(current ?? '')) return send(200,{customer:null});
    const {rows:[customer]} = await db.query(`SELECT a.email FROM delivery_customer_sessions s
      JOIN delivery_customer_accounts a ON a.id=s.customer_id
      WHERE s.token_hash=$1 AND s.expires_at>now()`,[hash(current)]);
    return send(200,{customer:customer ?? null});
  }
  if (req.method !== 'POST') return send(405,{error:'Methode nicht erlaubt.'});
  if (req.headers.origin !== origin.origin) return send(403,{error:'Anfrage nicht erlaubt.'});
  const setCookie = (value,seconds) => res.setHeader('Set-Cookie',
    cookieName+'='+value+'; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age='+seconds);
  if (action === 'logout') {
    if (tokenPattern.test(current ?? '')) await db.query('DELETE FROM delivery_customer_sessions WHERE token_hash=$1',[hash(current)]);
    setCookie('',0);
    return send(200,{customer:null});
  }
  if (!['request','confirm'].includes(action)) return send(405,{error:'Methode nicht erlaubt.'});

  let input,email;
  try {
    input = await readJsonObject(req,{maxBytes:1024});
    if (action === 'request') email = cleanMailAddress(input.email);
  } catch (error) {
    if (!error.status) throw error;
    return send(error.status,{error:error.message});
  }
  if (action === 'confirm' && (typeof input.token !== 'string' || !tokenPattern.test(input.token))) {
    return send(400,{error:'Anmeldelink ungültig oder abgelaufen.'});
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    if (action === 'request') {
      const token = secret();
      const {rows:[link]} = await client.query(`INSERT INTO delivery_customer_login_links(email,token_hash,expires_at)
        VALUES ($1,$2,now()+interval '15 minutes')
        ON CONFLICT(email) DO UPDATE SET token_hash=excluded.token_hash,expires_at=excluded.expires_at,requested_at=now()
        WHERE delivery_customer_login_links.requested_at<now()-interval '5 minutes'
        RETURNING expires_at`,[email,hash(token)]);
      if (link) {
        const url = new URL('/bestellen/#kundenlogin='+token,origin);
        await enqueueMail(client,'delivery-customer:'+hash(token),email,{
          subject:'Bei Bringness Bestellungen anmelden',
          text:'Öffne diesen Link innerhalb von 15 Minuten:\n\n'+url.href,
          expiresAt:link.expires_at
        });
      }
      await client.query('COMMIT');
      return send(202,{requested:true});
    }

    const {rows:[link]} = await client.query(`DELETE FROM delivery_customer_login_links
      WHERE token_hash=$1 AND expires_at>now() RETURNING email`,[hash(input.token)]);
    if (!link) {
      await client.query('ROLLBACK');
      return send(400,{error:'Anmeldelink ungültig oder abgelaufen.'});
    }
    const {rows:[customer]} = await client.query(`INSERT INTO delivery_customer_accounts(email) VALUES ($1)
      ON CONFLICT(email) DO UPDATE SET email=excluded.email RETURNING id,email`,[link.email]);
    const token = secret();
    if (tokenPattern.test(current ?? '')) await client.query('DELETE FROM delivery_customer_sessions WHERE token_hash=$1',[hash(current)]);
    await client.query(`INSERT INTO delivery_customer_sessions(token_hash,customer_id,expires_at)
      VALUES ($1,$2,now()+make_interval(days=>$3::int))`,[hash(token),customer.id,sessionDays]);
    await client.query('COMMIT');
    setCookie(token,sessionDays*86400);
    return send(200,{customer:{email:customer.email}});
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
