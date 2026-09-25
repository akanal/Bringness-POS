import crypto from "node:crypto";
import pg from "pg";
import QRCode from "qrcode";

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
