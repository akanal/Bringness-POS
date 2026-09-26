import crypto from "node:crypto";
import pg from "pg";
import QRCode from "qrcode";
import webpush from "web-push";
import PDFDocument from "pdfkit";

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
});

const json=(res,status,data)=>{res.writeHead(status,{"content-type":"application/json","cache-control":"no-store"});res.end(JSON.stringify(data))};
const readBody=req=>new Promise((resolve,reject)=>{let d="";req.on("data",c=>d+=c);req.on("end",()=>{try{resolve(d?JSON.parse(d):{})}catch(e){reject(e)}});req.on("error",reject)});
const bearer=req=>String(req.headers.authorization||"").replace(/^Bearer\s+/i,"");
async function user(req){
  const raw=bearer(req); if(!raw)return null;
  const tokenHash=crypto.createHash("sha256").update(raw).digest("hex");
  const q=await pool.query(`SELECT u.id,u.company_id,u.email,u.display_name,u.role
    FROM sessions s JOIN users u ON u.id=s.user_id
    WHERE s.token_hash=$1 AND s.expires_at>now() AND u.status='active'`,[tokenHash]);
  return q.rows[0]||null;
}
async function owner(req,res){
  const u=await user(req);
  if(!u){json(res,401,{error:"Nicht angemeldet"});return null}
  if(!["owner","admin"].includes(u.role)){json(res,403,{error:"Nur Restaurantbesitzer oder Administratoren"});return null}
  return u;
}

export async function migrateRestaurantOwnerFeatures(){
  await pool.query(`
    CREATE TABLE IF NOT EXISTS product_extras(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      name text NOT NULL,
      price_cents int NOT NULL DEFAULT 0 CHECK(price_cents>=0),
      active boolean NOT NULL DEFAULT true,
      sort_order int NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS product_extras_product_idx ON product_extras(product_id,sort_order,name);

    CREATE TABLE IF NOT EXISTS waiter_presence(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      user_id uuid REFERENCES users(id) ON DELETE SET NULL,
      started_at timestamptz NOT NULL DEFAULT now(),
      ended_at timestamptz,
      source text NOT NULL DEFAULT 'login'
    );
    CREATE INDEX IF NOT EXISTS waiter_presence_employee_idx ON waiter_presence(employee_id,started_at DESC);

    CREATE TABLE IF NOT EXISTS waiter_schedules(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
      starts_at timestamptz NOT NULL,
      ends_at timestamptz NOT NULL,
      note text,
      recurrence text,
      created_at timestamptz NOT NULL DEFAULT now(),
      CHECK(ends_at>starts_at)
    );
    CREATE INDEX IF NOT EXISTS waiter_schedules_restaurant_idx ON waiter_schedules(restaurant_id,starts_at);

    ALTER TABLE orders ADD COLUMN IF NOT EXISTS guest_email text;
    ALTER TABLE order_items ADD COLUMN IF NOT EXISTS extras_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb;
  `);
}

async function ensureProductOwner(productId,companyId){
  const q=await pool.query("SELECT p.id FROM products p JOIN restaurants r ON r.id=p.restaurant_id WHERE p.id=$1 AND r.company_id=$2",[productId,companyId]);
  return !!q.rowCount;
}

export async function handleRestaurantOwnerFeature(req,res){
  const url=new URL(req.url,"http://local"),p=url.pathname;

  const receiptQr=p.match(/^\/api\/v1\/receipts\/([0-9a-f-]{36})\/number-qr$/i);
  if(receiptQr && req.method==="GET"){
    const u=await user(req); if(!u)return json(res,401,{error:"Nicht angemeldet"});
    const q=await pool.query(`SELECT rc.receipt_number FROM receipts rc
      JOIN orders o ON o.id=rc.order_id JOIN restaurants r ON r.id=o.restaurant_id
      WHERE rc.id=$1 AND r.company_id=$2`,[receiptQr[1],u.company_id]);
    if(!q.rowCount)return json(res,404,{error:"Beleg nicht gefunden"});
    const svg=await QRCode.toString(q.rows[0].receipt_number,{type:"svg",width:260,margin:2,errorCorrectionLevel:"M"});
    res.writeHead(200,{"content-type":"image/svg+xml; charset=utf-8","cache-control":"private, no-store"});
    res.end(svg); return true;
  }

  const extras=p.match(/^\/api\/v1\/products\/([0-9a-f-]{36})\/extras$/i);
  if(extras && req.method==="GET"){
    const u=await user(req); if(!u)return json(res,401,{error:"Nicht angemeldet"});
    if(!await ensureProductOwner(extras[1],u.company_id))return json(res,404,{error:"Produkt nicht gefunden"});
    const q=await pool.query("SELECT id,name,price_cents,active,sort_order FROM product_extras WHERE product_id=$1 ORDER BY sort_order,name",[extras[1]]);
    json(res,200,{extras:q.rows}); return true;
  }
  if(extras && req.method==="POST"){
    const u=await owner(req,res); if(!u)return true;
    if(!await ensureProductOwner(extras[1],u.company_id))return json(res,404,{error:"Produkt nicht gefunden"});
    const b=await readBody(req),name=String(b.name||"").trim(),price=Number(b.priceCents);
    if(!name||name.length>100||!Number.isInteger(price)||price<0||price>1000000)return json(res,400,{error:"Beilage oder Preis ungültig"});
    const q=await pool.query("INSERT INTO product_extras(product_id,name,price_cents,sort_order) VALUES($1,$2,$3,$4) RETURNING id,name,price_cents,active,sort_order",[extras[1],name,price,Number.isInteger(b.sortOrder)?b.sortOrder:0]);
    json(res,201,q.rows[0]); return true;
  }

  const extraDelete=p.match(/^\/api\/v1\/product-extras\/([0-9a-f-]{36})$/i);
  if(extraDelete && req.method==="DELETE"){
    const u=await owner(req,res); if(!u)return true;
    const q=await pool.query(`UPDATE product_extras pe SET active=false
      FROM products p JOIN restaurants r ON r.id=p.restaurant_id
      WHERE pe.id=$1 AND pe.product_id=p.id AND r.company_id=$2 RETURNING pe.id`,[extraDelete[1],u.company_id]);
    if(!q.rowCount)return json(res,404,{error:"Beilage nicht gefunden"});
    json(res,200,{ok:true}); return true;
  }

  if(p==="/api/v1/guest/extras" && req.method==="GET"){
    const code=String(url.searchParams.get("code")||"");
    if(!/^[a-f0-9]{48}$/.test(code))return json(res,404,{error:"QR-Code ungültig"});
    const q=await pool.query(`SELECT pe.id,pe.product_id,pe.name,pe.price_cents
      FROM dining_tables t JOIN products p ON p.restaurant_id=t.restaurant_id
      JOIN product_extras pe ON pe.product_id=p.id
      WHERE t.qr_token=$1 AND p.active=true AND pe.active=true
      ORDER BY pe.product_id,pe.sort_order,pe.name`,[code]);
    json(res,200,{extras:q.rows}); return true;
  }

  if(p==="/api/v1/guest/order-v2" && req.method==="POST"){
    const b=await readBody(req),items=Array.isArray(b.items)?b.items:[],code=String(b.code||""),requestId=String(b.requestId||"");
    if(!/^[a-f0-9]{48}$/.test(code)||!items.length||items.length>20||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId))return json(res,400,{error:"Ungültiger Tisch oder Warenkorb"});
    const ids=items.map(i=>String(i.productId||"")); if(new Set(ids).size!==ids.length)return json(res,400,{error:"Doppelte Artikel im Warenkorb"});
    const c=await pool.connect();
    try{
      await c.query("BEGIN");
      const tq=await c.query(`SELECT t.id,t.restaurant_id,r.company_id,t.name table_name
        FROM dining_tables t JOIN restaurants r ON r.id=t.restaurant_id WHERE t.qr_token=$1 FOR UPDATE OF t`,[code]);
      if(!tq.rowCount){await c.query("ROLLBACK");return json(res,404,{error:"QR-Code ungültig"})}
      const t=tq.rows[0];
      const licensed=await c.query("SELECT 1 FROM company_features WHERE company_id=$1 AND feature_code='table_qr' AND status='active' AND ((ends_at IS NULL OR ends_at>now()) OR (grace_until IS NOT NULL AND grace_until>now()))",[t.company_id]);
      if(!licensed.rowCount){await c.query("ROLLBACK");return json(res,402,{error:"Tisch-QR ist nicht aktiviert"})}
      const existing=await c.query("SELECT id,total_cents FROM orders WHERE table_id=$1 AND guest_request_id=$2",[t.id,requestId]);
      if(existing.rowCount){await c.query("COMMIT");return json(res,200,{orderId:existing.rows[0].id,totalCents:existing.rows[0].total_cents,alreadyReceived:true})}
      const recent=await c.query("SELECT count(*)::int n FROM orders WHERE table_id=$1 AND source='qr' AND created_at>now()-interval '60 seconds'",[t.id]);
      if(recent.rows[0].n>=3){await c.query("ROLLBACK");return json(res,429,{error:"Zu viele Bestellungen für diesen Tisch. Bitte eine Minute warten oder das Personal ansprechen."})}
      const pq=await c.query("SELECT id,name,price_cents,tax_rate FROM products WHERE id=ANY($1::uuid[]) AND restaurant_id=$2 AND active=true",[ids,t.restaurant_id]);
      if(pq.rowCount!==ids.length){await c.query("ROLLBACK");return json(res,400,{error:"Artikel nicht verfügbar"})}
      const pm=new Map(pq.rows.map(z=>[z.id,z])); let total=0; const cleaned=[];
      for(const item of items){
        const pr=pm.get(String(item.productId)),qty=Number(item.qty),note=String(item.note||"").trim();
        if(!pr||!Number.isInteger(qty)||qty<1||qty>99){await c.query("ROLLBACK");return json(res,400,{error:"Ungültige Menge"})}
        if(note.length>300){await c.query("ROLLBACK");return json(res,400,{error:"Extrawunsch ist zu lang"})}
        const extraIds=Array.isArray(item.extraIds)?[...new Set(item.extraIds.map(String))]:[];
        let extras=[];
        if(extraIds.length){
          const ex=await c.query("SELECT id,name,price_cents FROM product_extras WHERE product_id=$1 AND active=true AND id=ANY($2::uuid[]) ORDER BY sort_order,name",[pr.id,extraIds]);
          if(ex.rowCount!==extraIds.length){await c.query("ROLLBACK");return json(res,400,{error:"Eine gewählte Beilage ist nicht mehr verfügbar"})}
          extras=ex.rows;
        }
        const extraPerUnit=extras.reduce((sum,x)=>sum+Number(x.price_cents),0);
        total+=(Number(pr.price_cents)+extraPerUnit)*qty;
        cleaned.push({pr,qty,note,extras,unitPrice:Number(pr.price_cents)+extraPerUnit});
      }
      if(total<=0||total>100000000){await c.query("ROLLBACK");return json(res,400,{error:"Ungültiger Betrag"})}
      const email=String(b.email||"").trim().toLowerCase();
      if(email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){await c.query("ROLLBACK");return json(res,400,{error:"E-Mail-Adresse ist ungültig"})}
      const o=(await c.query("INSERT INTO orders(restaurant_id,table_id,source,status,total_cents,guest_request_id,guest_email) VALUES($1,$2,'qr','open',$3,$4,$5) RETURNING id",[t.restaurant_id,t.id,total,requestId,email||null])).rows[0];
      for(const item of cleaned){
        const snapshot=item.extras.map(x=>({id:x.id,name:x.name,price_cents:Number(x.price_cents)}));
        await c.query("INSERT INTO order_items(order_id,product_id,product_name_snapshot,unit_price_cents,tax_rate_snapshot,quantity,guest_note,extras_snapshot) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",[o.id,item.pr.id,item.pr.name,item.unitPrice,item.pr.tax_rate,item.qty,item.note||null,JSON.stringify(snapshot)]);
      }
      await c.query("UPDATE dining_tables SET status='open' WHERE id=$1",[t.id]);
      const pushes=(await c.query("SELECT wps.endpoint,wps.subscription FROM dining_tables dt JOIN employees e ON e.id=dt.waiter_employee_id AND e.active=true JOIN waiter_push_subscriptions wps ON wps.user_id=e.user_id WHERE dt.id=$1",[t.id])).rows;
      await c.query("COMMIT");
      if(pushes.length&&process.env.VAPID_PUBLIC_KEY&&process.env.VAPID_PRIVATE_KEY){
        webpush.setVapidDetails(process.env.VAPID_SUBJECT||"mailto:info@bringness.de",process.env.VAPID_PUBLIC_KEY,process.env.VAPID_PRIVATE_KEY);
        const payload=JSON.stringify({title:"Neue Bestellung · "+t.table_name,body:"Eine neue QR-Bestellung ist eingegangen.",url:"/service/"});
        Promise.allSettled(pushes.map(async row=>{try{await webpush.sendNotification(row.subscription,payload,{TTL:300})}catch(e){if(e.statusCode===404||e.statusCode===410)await pool.query("DELETE FROM waiter_push_subscriptions WHERE endpoint=$1",[row.endpoint])}}));
      }
      json(res,201,{orderId:o.id,totalCents:total,emailReceiptRequested:!!email,emailDeliveryConfigured:false});
      return true;
    }catch(error){await c.query("ROLLBACK");if(error.code==="22P02")return json(res,400,{error:"Ungültiger Artikel oder Beilage"});throw error}finally{c.release()}
  }

  if(p==="/api/v1/waiter/presence/start" && req.method==="POST"){
    const u=await user(req); if(!u)return json(res,401,{error:"Nicht angemeldet"});
    if(u.role!=="waiter")return json(res,403,{error:"Kein Kellnerkonto"});
    const e=(await pool.query("SELECT e.id FROM employees e JOIN restaurants r ON r.id=e.restaurant_id WHERE e.user_id=$1 AND e.active=true AND e.role='waiter' AND r.company_id=$2",[u.id,u.company_id])).rows[0];
    if(!e)return json(res,404,{error:"Kellner nicht gefunden"});
    const open=(await pool.query("SELECT id,started_at FROM waiter_presence WHERE employee_id=$1 AND ended_at IS NULL ORDER BY started_at DESC LIMIT 1",[e.id])).rows[0];
    if(open)return json(res,200,{presence:open,alreadyOpen:true});
    const q=await pool.query("INSERT INTO waiter_presence(employee_id,user_id) VALUES($1,$2) RETURNING id,started_at",[e.id,u.id]);
    json(res,201,{presence:q.rows[0]}); return true;
  }

  if(p==="/api/v1/waiter/presence/end" && req.method==="POST"){
    const u=await user(req); if(!u)return json(res,401,{error:"Nicht angemeldet"});
    if(u.role!=="waiter")return json(res,403,{error:"Kein Kellnerkonto"});
    const q=await pool.query(`UPDATE waiter_presence wp SET ended_at=now()
      FROM employees e WHERE wp.employee_id=e.id AND e.user_id=$1 AND wp.ended_at IS NULL
      RETURNING wp.id,wp.started_at,wp.ended_at`,[u.id]);
    json(res,200,{ended:q.rows}); return true;
  }

  const tableDetails=p.match(/^\/api\/v1\/tables\/([0-9a-f-]{36})\/details$/i);
  if(tableDetails && req.method==="GET"){
    const u=await user(req);if(!u)return json(res,401,{error:"Nicht angemeldet"});
    const t=await pool.query("SELECT t.* FROM dining_tables t JOIN restaurants r ON r.id=t.restaurant_id WHERE t.id=$1 AND r.company_id=$2",[tableDetails[1],u.company_id]);
    if(!t.rowCount)return json(res,404,{error:"Tisch nicht gefunden"});
    const q=await pool.query(`SELECT o.id,o.status,o.total_cents,o.created_at,o.closed_at,o.source,o.guest_email,
      (SELECT coalesce(json_agg(json_build_object('name',oi.product_name_snapshot,'quantity',oi.quantity,'note',oi.guest_note,'extras',oi.extras_snapshot)),'[]'::json) FROM order_items oi WHERE oi.order_id=o.id) items
      FROM orders o WHERE o.table_id=$1 AND o.restaurant_id=$2
      AND (o.status NOT IN ('paid','cancelled') OR coalesce(o.closed_at,o.created_at)>now()-interval '24 hours')
      ORDER BY o.created_at DESC LIMIT 80`,[tableDetails[1],t.rows[0].restaurant_id]);
    json(res,200,{table:t.rows[0],orders:q.rows,historyWindowHours:24});return true;
  }

  if(p==="/api/v1/owner/presence" && req.method==="GET"){
    const u=await owner(req,res); if(!u)return true;
    const rid=String(url.searchParams.get("restaurantId")||"");
    const q=await pool.query(`SELECT wp.id,wp.started_at,wp.ended_at,e.id employee_id,e.display_name
      FROM waiter_presence wp JOIN employees e ON e.id=wp.employee_id JOIN restaurants r ON r.id=e.restaurant_id
      WHERE r.id=$1 AND r.company_id=$2 ORDER BY wp.started_at DESC LIMIT 300`,[rid,u.company_id]);
    json(res,200,{presence:q.rows}); return true;
  }

  if(p==="/api/v1/owner/schedules" && req.method==="GET"){
    const u=await owner(req,res); if(!u)return true;
    const rid=String(url.searchParams.get("restaurantId")||"");
    const q=await pool.query(`SELECT ws.id,ws.employee_id,e.display_name,ws.starts_at,ws.ends_at,ws.note,ws.recurrence
      FROM waiter_schedules ws JOIN employees e ON e.id=ws.employee_id JOIN restaurants r ON r.id=ws.restaurant_id
      WHERE ws.restaurant_id=$1 AND r.company_id=$2 AND ws.ends_at>now()-interval '7 days'
      ORDER BY ws.starts_at LIMIT 300`,[rid,u.company_id]);
    json(res,200,{schedules:q.rows}); return true;
  }

  if(p==="/api/v1/owner/schedules" && req.method==="POST"){
    const u=await owner(req,res); if(!u)return true;
    const b=await readBody(req),rid=String(b.restaurantId||""),employeeId=String(b.employeeId||"");
    const starts=new Date(b.startsAt),ends=new Date(b.endsAt);
    if(!employeeId||!rid||isNaN(starts)||isNaN(ends)||ends<=starts)return json(res,400,{error:"Dienstzeit ungültig"});
    const ok=await pool.query(`SELECT 1 FROM employees e JOIN restaurants r ON r.id=e.restaurant_id
      WHERE e.id=$1 AND e.restaurant_id=$2 AND r.company_id=$3 AND e.active=true`,[employeeId,rid,u.company_id]);
    if(!ok.rowCount)return json(res,403,{error:"Mitarbeiter nicht erlaubt"});
    const q=await pool.query(`INSERT INTO waiter_schedules(employee_id,restaurant_id,starts_at,ends_at,note,recurrence)
      VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,[employeeId,rid,starts.toISOString(),ends.toISOString(),String(b.note||"").slice(0,300)||null,String(b.recurrence||"").slice(0,50)||null]);
    json(res,201,q.rows[0]); return true;
  }

  if(p==="/api/v1/waiter/schedule" && req.method==="GET"){
    const u=await user(req); if(!u)return json(res,401,{error:"Nicht angemeldet"});
    if(u.role!=="waiter")return json(res,403,{error:"Kein Kellnerkonto"});
    const q=await pool.query(`SELECT ws.id,ws.starts_at,ws.ends_at,ws.note,ws.recurrence,r.name restaurant_name
      FROM waiter_schedules ws JOIN employees e ON e.id=ws.employee_id JOIN restaurants r ON r.id=ws.restaurant_id
      WHERE e.user_id=$1 AND e.active=true AND ws.ends_at>now()-interval '1 day'
      ORDER BY ws.starts_at LIMIT 100`,[u.id]);
    json(res,200,{schedules:q.rows}); return true;
  }

  return false;
}
