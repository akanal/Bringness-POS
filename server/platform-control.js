import crypto from "node:crypto";
import pg from "pg";

const pool=new pg.Pool({
  connectionString:process.env.DATABASE_URL,
  ssl:process.env.NODE_ENV==="production"?{rejectUnauthorized:false}:false
});
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function send(res,status,data){
  res.writeHead(status,{"content-type":"application/json","cache-control":"no-store"});
  res.end(JSON.stringify(data));
}
async function readBody(req){
  let raw="";
  for await(const chunk of req){
    raw+=chunk;
    if(raw.length>16384)throw Error("Anfrage zu groß");
  }
  return raw?JSON.parse(raw):{};
}
async function platformUser(req){
  const token=String(req.headers.authorization||"").replace(/^Bearer\s+/i,"");
  if(!token)return null;
  const hash=crypto.createHash("sha256").update(token).digest("hex");
  const result=await pool.query(`
    SELECT u.id FROM sessions s
    JOIN users u ON u.id=s.user_id
    JOIN platform_admins pa ON pa.user_id=u.id AND pa.active=true
    WHERE s.token_hash=$1 AND s.expires_at>now() AND u.status='active' AND NOT coalesce(u.must_change_password,false)
  `,[hash]);
  return result.rows[0]||null;
}

export async function handlePlatformControl(req,res){
  const url=new URL(req.url,"http://localhost");
  if(!url.pathname.startsWith("/api/v1/platform/control/"))return false;
  const actor=await platformUser(req);
  if(!actor){send(res,403,{error:"Nur Bringness-Plattformadministratoren"});return true}
  const p=url.pathname;
  if(p==="/api/v1/platform/control/offline"&&req.method==="GET"){
    const counts=(await pool.query("SELECT stock_state,count(*)::int count FROM pos_offline_sales GROUP BY stock_state")).rows;
    const sales=(await pool.query(`SELECT s.id,s.stock_state,s.stock_error,s.created_at,o.created_at sold_at,o.total_cents,r.name restaurant_name,c.name company_name,d.name device_name
      FROM pos_offline_sales s JOIN orders o ON o.id=s.order_id JOIN restaurants r ON r.id=o.restaurant_id JOIN companies c ON c.id=r.company_id
      JOIN pos_offline_catalogs catalog ON catalog.id=s.catalog_id JOIN devices d ON d.id=catalog.device_id
      WHERE s.stock_state IN ('pending','conflict') ORDER BY s.created_at DESC LIMIT 100`)).rows;
    send(res,200,{counts,sales,limited:sales.length===100});return true;
  }
  if(p==="/api/v1/platform/control/registers"&&req.method==="GET"){
    const q=await pool.query(`
      SELECT r.id,r.company_id,r.name,r.mode,c.name company_name,
        (SELECT count(*)::int FROM orders o WHERE o.restaurant_id=r.id) order_count,
        (SELECT count(*)::int FROM receipts rc JOIN orders o ON o.id=rc.order_id
          WHERE o.restaurant_id=r.id) receipt_count,
        (SELECT count(*)::int FROM receipts rc JOIN orders o ON o.id=rc.order_id
          WHERE o.restaurant_id=r.id AND rc.fiscal_status IS DISTINCT FROM 'signed') unsigned_receipts,
        td.provider tse_provider,td.status tse_status,td.certified tse_certified,
        (SELECT count(*)::int FROM tse_transactions tx WHERE tx.restaurant_id=r.id AND tx.state='failed') failed_tse_transactions
      FROM restaurants r JOIN companies c ON c.id=r.company_id
      LEFT JOIN tse_devices td ON td.restaurant_id=r.id
      ORDER BY c.name,r.name LIMIT 500
    `);
    const d=await pool.query(`
      SELECT d.id,d.company_id,d.name,d.platform,d.app_version,d.status,d.last_seen_at,
        c.name company_name,
        (SELECT count(*)::int FROM device_commands dc WHERE dc.device_id=d.id AND dc.status='pending') pending_commands
      FROM devices d JOIN companies c ON c.id=d.company_id
      ORDER BY d.last_seen_at DESC NULLS LAST LIMIT 500
    `);
    send(res,200,{restaurants:q.rows,devices:d.rows,limited:q.rowCount===500||d.rowCount===500});return true;
  }
  if(p==="/api/v1/platform/control/companies"&&req.method==="GET"){
    const q=await pool.query(`SELECT c.id,c.name,c.created_at,
      (SELECT email FROM users u WHERE u.company_id=c.id AND u.role='owner' ORDER BY u.created_at LIMIT 1) owner_email,
      (SELECT count(*)::int FROM restaurants r WHERE r.company_id=c.id) restaurants,
      (SELECT count(*)::int FROM devices d WHERE d.company_id=c.id) devices
      FROM companies c ORDER BY c.name LIMIT 500`);
    send(res,200,{companies:q.rows,limited:q.rowCount===500});return true;
  }
  if(p==="/api/v1/platform/control/search"&&req.method==="GET"){
    const term=String(url.searchParams.get("q")||"").trim().toLocaleLowerCase("de-DE");
    if(term.length>100){send(res,400,{error:"Suchbegriff zu lang"});return true}
    if(term&&term.length<2){send(res,200,{companies:[],restaurants:[],owners:[],employees:[]});return true}
    if(!term){
      const recent=await pool.query("SELECT id,name FROM companies ORDER BY created_at DESC LIMIT 25");
      send(res,200,{companies:recent.rows,restaurants:[],owners:[],employees:[]});return true;
    }
    const [companies,restaurants,owners,employees]=await Promise.all([
      pool.query(`SELECT c.id,c.name FROM companies c WHERE position($1 in lower(c.name))>0
        OR EXISTS(SELECT 1 FROM users u WHERE u.company_id=c.id AND u.role='owner'
          AND (position($1 in lower(u.display_name))>0 OR position($1 in lower(u.email))>0))
        ORDER BY c.name LIMIT 30`,[term]),
      pool.query(`SELECT r.id,r.name,c.id company_id,c.name company_name FROM restaurants r
        JOIN companies c ON c.id=r.company_id WHERE position($1 in lower(r.name))>0
        ORDER BY c.name,r.name LIMIT 30`,[term]),
      pool.query(`SELECT u.id,u.display_name,u.email,c.id company_id,c.name company_name FROM users u
        JOIN companies c ON c.id=u.company_id WHERE u.role='owner'
        AND (position($1 in lower(u.display_name))>0 OR position($1 in lower(u.email))>0)
        ORDER BY u.display_name LIMIT 30`,[term]),
      pool.query(`SELECT e.id,e.display_name,e.role,r.name restaurant_name,c.id company_id,c.name company_name,
        u.email FROM employees e JOIN restaurants r ON r.id=e.restaurant_id
        JOIN companies c ON c.id=r.company_id LEFT JOIN users u ON u.id=e.user_id
        WHERE position($1 in lower(e.display_name))>0 OR position($1 in lower(coalesce(u.email,'')))>0
        ORDER BY e.display_name LIMIT 30`,[term])
    ]);
    send(res,200,{companies:companies.rows,restaurants:restaurants.rows,owners:owners.rows,employees:employees.rows});return true;
  }
  const companyDetail=p.match(/^\/api\/v1\/platform\/control\/companies\/([^/]+)$/);
  if(companyDetail&&req.method==="GET"){
    const id=companyDetail[1];if(!uuid.test(id)){send(res,400,{error:"Ungültiges Kundenkonto"});return true}
    const company=(await pool.query("SELECT id,name,created_at FROM companies WHERE id=$1",[id])).rows[0];
    if(!company){send(res,404,{error:"Kundenkonto nicht gefunden"});return true}
    const [users,restaurants,devices,features,licenses,payments]=await Promise.all([
      pool.query("SELECT id,display_name,email,role,status FROM users WHERE company_id=$1 ORDER BY created_at LIMIT 100",[id]),
      pool.query(`SELECT r.id,r.name,r.mode,td.provider tse_provider,td.status tse_status,td.certified tse_certified,
        (SELECT count(*)::int FROM orders o WHERE o.restaurant_id=r.id) orders,
        (SELECT count(*)::int FROM receipts rc JOIN orders o ON o.id=rc.order_id WHERE o.restaurant_id=r.id) receipts,
        (SELECT count(*)::int FROM receipts rc JOIN orders o ON o.id=rc.order_id WHERE o.restaurant_id=r.id AND rc.fiscal_status IS DISTINCT FROM 'signed') unsigned_receipts,
        (SELECT count(*)::int FROM tse_transactions tx WHERE tx.restaurant_id=r.id AND tx.state='failed') failed_tse
        FROM restaurants r LEFT JOIN tse_devices td ON td.restaurant_id=r.id WHERE r.company_id=$1 ORDER BY r.name LIMIT 100`,[id]),
      pool.query(`SELECT id,name,platform,app_version,status,last_seen_at,
        (SELECT count(*)::int FROM device_commands dc WHERE dc.device_id=d.id AND dc.status='pending') pending_commands
        FROM devices d WHERE company_id=$1 ORDER BY last_seen_at DESC NULLS LAST LIMIT 100`,[id]),
      pool.query("SELECT feature_code,status,payment_status,ends_at,grace_until FROM company_features WHERE company_id=$1 ORDER BY feature_code",[id]),
      pool.query(`SELECT bp.name,bp.code,bp.billing_type,ce.status,ce.current_period_end,ce.purchased_at
        FROM company_entitlements ce JOIN billing_plans bp ON bp.id=ce.plan_id WHERE ce.company_id=$1 ORDER BY ce.created_at DESC LIMIT 100`,[id]),
      pool.query(`SELECT bt.id,bp.name plan,bt.status,bt.amount_cents,bt.currency,bt.invoice_number,bt.invoice_date,bt.created_at
        FROM billing_transactions bt JOIN billing_plans bp ON bp.id=bt.plan_id WHERE bt.company_id=$1 ORDER BY bt.created_at DESC LIMIT 50`,[id])
    ]);
    send(res,200,{company,users:users.rows,restaurants:restaurants.rows,devices:devices.rows,features:features.rows,licenses:licenses.rows,payments:payments.rows});return true;
  }
  if(p==="/api/v1/platform/control/accounts"&&req.method==="GET"){
    const q=await pool.query(`SELECT u.id,u.company_id,c.name company_name,u.display_name,u.email,u.role,u.status,u.created_at,
      EXISTS(SELECT 1 FROM platform_admins pa WHERE pa.user_id=u.id AND pa.active=true) platform_admin,
      (SELECT count(*)::int FROM employees e WHERE e.user_id=u.id AND e.active=true) active_assignments
      FROM users u JOIN companies c ON c.id=u.company_id
      ORDER BY c.name,u.created_at LIMIT 500`);
    send(res,200,{accounts:q.rows,limited:q.rowCount===500});return true;
  }
  if(p==="/api/v1/platform/control/audit"&&req.method==="GET"){
    const q=await pool.query(`SELECT a.id,a.created_at,a.event_type,a.entity_type,a.entity_id,
      c.name company_name,u.email actor_email
      FROM audit_log a LEFT JOIN companies c ON c.id=a.company_id
      LEFT JOIN users u ON u.id=a.actor_user_id
      ORDER BY a.id DESC LIMIT 200`);
    send(res,200,{events:q.rows,limited:q.rowCount===200});return true;
  }
  const accountStatus=p.match(/^\/api\/v1\/platform\/control\/accounts\/([^/]+)\/status$/);
  if(accountStatus&&req.method==="PATCH"){
    if(!uuid.test(accountStatus[1])){send(res,400,{error:"Ungültiges Konto"});return true}
    let input;try{input=await readBody(req)}catch{send(res,400,{error:"Ungültige Anfrage"});return true}
    if(!["active","blocked"].includes(input.status)){send(res,400,{error:"Ungültiger Status"});return true}
    const client=await pool.connect();
    try{
      await client.query("BEGIN");
      const ownerCompany=(await client.query("SELECT company_id FROM users WHERE id=$1",[accountStatus[1]])).rows[0];
      if(!ownerCompany){await client.query("ROLLBACK");send(res,404,{error:"Konto nicht gefunden"});return true}
      await client.query("SELECT id FROM companies WHERE id=$1 FOR UPDATE",[ownerCompany.company_id]);
      const user=(await client.query("SELECT id,company_id,status,role FROM users WHERE id=$1 FOR UPDATE",[accountStatus[1]])).rows[0];
      if(!user){await client.query("ROLLBACK");send(res,404,{error:"Konto nicht gefunden"});return true}
      if(user.id===actor.id){await client.query("ROLLBACK");send(res,409,{error:"Das eigene Admin-Konto kann hier nicht gesperrt werden"});return true}
      const platform=(await client.query("SELECT 1 FROM platform_admins WHERE user_id=$1 AND active=true",[user.id])).rowCount>0;
      if(platform){await client.query("ROLLBACK");send(res,409,{error:"Plattformadministratoren können hier nicht gesperrt werden"});return true}
      if(input.status==="blocked"&&user.role==="owner"&&user.status==="active"){
        const owners=await client.query("SELECT id FROM users WHERE company_id=$1 AND role='owner' AND status='active' FOR UPDATE",[user.company_id]);
        if(owners.rowCount<=1){await client.query("ROLLBACK");send(res,409,{error:"Der letzte aktive Inhaber eines Kundenkontos darf nicht gesperrt werden"});return true}
      }
      if(user.status!==input.status){
        await client.query("UPDATE users SET status=$2 WHERE id=$1",[user.id,input.status]);
        if(input.status==="blocked")await client.query("DELETE FROM sessions WHERE user_id=$1",[user.id]);
        await client.query("INSERT INTO audit_log(company_id,actor_user_id,event_type,entity_type,entity_id,payload) VALUES($1,$2,'platform.account.status','user',$3,$4)",[user.company_id,actor.id,user.id,JSON.stringify({before:user.status,after:input.status})]);
      }
      await client.query("COMMIT");send(res,200,{id:user.id,status:input.status});return true;
    }catch(error){await client.query("ROLLBACK");throw error}finally{client.release()}
  }
  const restaurant=p.match(/^\/api\/v1\/platform\/control\/registers\/([^/]+)$/);
  if(restaurant&&req.method==="PATCH"){
    if(!uuid.test(restaurant[1])){send(res,400,{error:"Ungültiger Betrieb"});return true}
    let body;try{body=await readBody(req)}catch{send(res,400,{error:"Ungültige Anfrage"});return true}
    const name=String(body.name||"").trim(),mode=String(body.mode||"");
    if(name.length<2||name.length>120||!["counter","restaurant"].includes(mode)){
      send(res,400,{error:"Betriebsname oder Betriebsart ungültig"});return true;
    }
    const client=await pool.connect();
    try{
      await client.query("BEGIN");
      const old=(await client.query("SELECT id,company_id,name,mode FROM restaurants WHERE id=$1 FOR UPDATE",[restaurant[1]])).rows[0];
      if(!old){await client.query("ROLLBACK");send(res,404,{error:"Betrieb nicht gefunden"});return true}
      const updated=(await client.query("UPDATE restaurants SET name=$2,mode=$3 WHERE id=$1 RETURNING id,company_id,name,mode",[old.id,name,mode])).rows[0];
      await client.query("INSERT INTO audit_log(company_id,actor_user_id,event_type,entity_type,entity_id,payload) VALUES($1,$2,'platform.restaurant.updated','restaurant',$3,$4)",[old.company_id,actor.id,old.id,JSON.stringify({before:{name:old.name,mode:old.mode},after:{name,mode}})]);
      await client.query("COMMIT");
      send(res,200,{restaurant:updated});return true;
    }catch(error){await client.query("ROLLBACK");throw error}finally{client.release()}
  }
  const device=p.match(/^\/api\/v1\/platform\/control\/devices\/([^/]+)\/sync$/);
  const deviceDetail=p.match(/^\/api\/v1\/platform\/control\/devices\/([^/]+)$/);
  if(deviceDetail&&req.method==="GET"){
    if(!uuid.test(deviceDetail[1])){send(res,400,{error:"Ungültiges Gerät"});return true}
    const d=(await pool.query(`SELECT d.id,d.company_id,c.name company_name,d.name,d.platform,d.app_version,d.status,d.created_at,d.last_seen_at,
      bp.name license_name,ce.status license_status,ce.current_period_end license_end
      FROM devices d JOIN companies c ON c.id=d.company_id
      LEFT JOIN company_entitlements ce ON ce.id=d.entitlement_id
      LEFT JOIN billing_plans bp ON bp.id=ce.plan_id WHERE d.id=$1`,[deviceDetail[1]])).rows[0];
    if(!d){send(res,404,{error:"Gerät nicht gefunden"});return true}
    const commands=await pool.query(`SELECT dc.id,dc.command,dc.status,dc.created_at,dc.acknowledged_at,u.email created_by
      FROM device_commands dc LEFT JOIN users u ON u.id=dc.created_by
      WHERE dc.device_id=$1 ORDER BY dc.created_at DESC LIMIT 30`,[d.id]);
    send(res,200,{device:d,commands:commands.rows,online:!!d.last_seen_at&&Date.now()-new Date(d.last_seen_at).getTime()<300000});return true;
  }
  if(device&&req.method==="POST"){
    if(!uuid.test(device[1])){send(res,400,{error:"Ungültiges Gerät"});return true}
    const client=await pool.connect();
    try{
      await client.query("BEGIN");
      const d=(await client.query("SELECT id,company_id,status FROM devices WHERE id=$1 FOR UPDATE",[device[1]])).rows[0];
      if(!d){await client.query("ROLLBACK");send(res,404,{error:"Gerät nicht gefunden"});return true}
      if(d.status!=="active"){await client.query("ROLLBACK");send(res,409,{error:"Gerät ist nicht aktiv"});return true}
      const existing=(await client.query("SELECT id,status,created_at FROM device_commands WHERE device_id=$1 AND command='sync' AND status='pending' ORDER BY created_at LIMIT 1",[d.id])).rows[0];
      const command=existing||(await client.query("INSERT INTO device_commands(device_id,command,created_by) VALUES($1,'sync',$2) RETURNING id,status,created_at",[d.id,actor.id])).rows[0];
      if(!existing)await client.query("INSERT INTO audit_log(company_id,actor_user_id,event_type,entity_type,entity_id,payload) VALUES($1,$2,'platform.device.sync_queued','device',$3,$4)",[d.company_id,actor.id,d.id,JSON.stringify({commandId:command.id})]);
      await client.query("COMMIT");
      send(res,202,{command,delivery:"when_online"});return true;
    }catch(error){await client.query("ROLLBACK");throw error}finally{client.release()}
  }
  const deviceStatus=p.match(/^\/api\/v1\/platform\/control\/devices\/([^/]+)\/status$/);
  if(deviceStatus&&req.method==="PATCH"){
    if(!uuid.test(deviceStatus[1])){send(res,400,{error:"Ungültiges Gerät"});return true}
    let body;try{body=await readBody(req)}catch{send(res,400,{error:"Ungültige Anfrage"});return true}
    if(!["active","blocked"].includes(body.status)){send(res,400,{error:"Ungültiger Gerätestatus"});return true}
    const client=await pool.connect();
    try{
      await client.query("BEGIN");
      const old=(await client.query("SELECT id,company_id,status FROM devices WHERE id=$1 FOR UPDATE",[deviceStatus[1]])).rows[0];
      if(!old){await client.query("ROLLBACK");send(res,404,{error:"Gerät nicht gefunden"});return true}
      const updated=(await client.query("UPDATE devices SET status=$2 WHERE id=$1 RETURNING id,status",[old.id,body.status])).rows[0];
      await client.query("INSERT INTO audit_log(company_id,actor_user_id,event_type,entity_type,entity_id,payload) VALUES($1,$2,'platform.device.status','device',$3,$4)",[old.company_id,actor.id,old.id,JSON.stringify({before:old.status,after:body.status})]);
      await client.query("COMMIT");
      send(res,200,{device:updated});return true;
    }catch(error){await client.query("ROLLBACK");throw error}finally{client.release()}
  }
  send(res,404,{error:"Admin-Funktion nicht gefunden"});return true;
}
