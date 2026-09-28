import crypto from "node:crypto";
import pg from "pg";

const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.NODE_ENV==="production"?{rejectUnauthorized:false}:false});
const sha=s=>crypto.createHash("sha256").update(s).digest("hex");
const passwordHash=s=>crypto.scryptSync(s,process.env.PASSWORD_PEPPER||"bringness-pos",64).toString("hex");
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function send(res,code,payload){res.writeHead(code,{"content-type":"application/json","cache-control":"no-store"});res.end(JSON.stringify(payload))}
async function read(req){let raw="";for await(const chunk of req){raw+=chunk;if(raw.length>8192)throw Error("Anfrage zu groß")}return raw?JSON.parse(raw):{}}
async function admin(req){const token=String(req.headers.authorization||"").replace(/^Bearer\s+/i,"");if(!token)return null;const q=await pool.query(`SELECT u.id,u.company_id,u.role FROM sessions s JOIN users u ON u.id=s.user_id
  WHERE s.token_hash=$1 AND s.expires_at>now() AND u.status='active' AND u.role IN ('owner','admin')`,[sha(token)]);return q.rows[0]||null}

export async function handleAdminTeam(req,res){
  const p=new URL(req.url,"http://localhost").pathname;
  if(p!=="/api/v1/employees"&&!p.startsWith("/api/v1/admin/team"))return false;
  if(p==="/api/v1/employees"&&req.method!=="POST")return false;
  const actor=await admin(req);
  if(!actor){send(res,403,{error:"Nur Inhaber und Administratoren dürfen Mitarbeiter verwalten"});return true}
  if(p==="/api/v1/admin/team"&&req.method==="GET"){
    const q=await pool.query(`SELECT e.id,e.restaurant_id,r.name restaurant_name,e.display_name,e.role,e.active,
      e.user_id,u.email,u.status account_status FROM employees e
      JOIN restaurants r ON r.id=e.restaurant_id LEFT JOIN users u ON u.id=e.user_id
      WHERE r.company_id=$1 ORDER BY r.name,e.display_name LIMIT 500`,[actor.company_id]);
    send(res,200,{employees:q.rows,limited:q.rowCount===500});return true;
  }
  if(p==="/api/v1/admin/team/admins"&&req.method==="GET"){
    const q=await pool.query("SELECT id,display_name,email,role,status,created_at,must_change_password FROM users WHERE company_id=$1 AND role IN ('owner','admin') ORDER BY created_at LIMIT 100",[actor.company_id]);
    send(res,200,{admins:q.rows,canManage:actor.role==="owner"});return true;
  }
  if(p==="/api/v1/admin/team/admins"&&req.method==="POST"){
    if(actor.role!=="owner"){send(res,403,{error:"Nur der Inhaber darf Administratoren anlegen"});return true}
    let input;try{input=await read(req)}catch{send(res,400,{error:"Ungültige Anfrage"});return true}
    const name=String(input.name||"").trim(),email=String(input.email||"").trim().toLowerCase(),password=String(input.password||"");
    if(name.length<2||name.length>100||email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||password.length<12||password.length>128){send(res,400,{error:"Name, E-Mail und Erstpasswort mit 12 bis 128 Zeichen erforderlich"});return true}
    const client=await pool.connect();
    try{
      await client.query("BEGIN");
      const user=(await client.query("INSERT INTO users(company_id,email,password_hash,display_name,status,role,must_change_password) VALUES($1,$2,$3,$4,'active','admin',true) RETURNING id,display_name,email,role,status",[actor.company_id,email,passwordHash(password),name])).rows[0];
      await client.query("INSERT INTO audit_log(company_id,actor_user_id,event_type,entity_type,entity_id) VALUES($1,$2,'admin.account.created','user',$3)",[actor.company_id,actor.id,user.id]);
      await client.query("COMMIT");send(res,201,{admin:user,message:"Admin-Konto angelegt. Startpasswort persönlich übergeben; beim ersten Login muss es geändert werden."});return true;
    }catch(error){await client.query("ROLLBACK");if(error.code==="23505"){send(res,409,{error:"E-Mail ist bereits vergeben"});return true}throw error}finally{client.release()}
  }
  const adminStatus=p.match(/^\/api\/v1\/admin\/team\/admins\/([^/]+)\/status$/);
  if(adminStatus&&req.method==="PATCH"){
    if(actor.role!=="owner"){send(res,403,{error:"Nur der Inhaber darf Administratoren sperren"});return true}
    if(!uuid.test(adminStatus[1])){send(res,400,{error:"Ungültiger Administrator"});return true}
    let input;try{input=await read(req)}catch{send(res,400,{error:"Ungültige Anfrage"});return true}
    if(!["active","blocked"].includes(input.status)){send(res,400,{error:"Ungültiger Kontostatus"});return true}
    const client=await pool.connect();
    try{
      await client.query("BEGIN");
      const user=(await client.query("SELECT id,status FROM users WHERE id=$1 AND company_id=$2 AND role='admin' FOR UPDATE",[adminStatus[1],actor.company_id])).rows[0];
      if(!user){await client.query("ROLLBACK");send(res,404,{error:"Administrator nicht gefunden"});return true}
      const platform=await client.query("SELECT 1 FROM platform_admins WHERE user_id=$1 AND active=true",[user.id]);
      if(platform.rowCount){await client.query("ROLLBACK");send(res,409,{error:"Plattformadministrator kann hier nicht gesperrt werden"});return true}
      if(user.status!==input.status){
        await client.query("UPDATE users SET status=$2 WHERE id=$1",[user.id,input.status]);
        if(input.status==="blocked")await client.query("DELETE FROM sessions WHERE user_id=$1",[user.id]);
        await client.query("INSERT INTO audit_log(company_id,actor_user_id,event_type,entity_type,entity_id,payload) VALUES($1,$2,'admin.account.status','user',$3,$4)",[actor.company_id,actor.id,user.id,JSON.stringify({before:user.status,after:input.status})]);
      }
      await client.query("COMMIT");send(res,200,{id:user.id,status:input.status});return true;
    }catch(error){await client.query("ROLLBACK");throw error}finally{client.release()}
  }
  if(p==="/api/v1/employees"&&req.method==="POST"){
    let input;try{input=await read(req)}catch{send(res,400,{error:"Ungültige Anfrage"});return true}
    const name=String(input.name||"").trim(),role=String(input.role||"cashier"),pin=String(input.pin||"");
    if(!uuid.test(String(input.restaurantId||""))||name.length<2||name.length>100||!["cashier","kitchen","manager"].includes(role)||pin.length>32){send(res,400,{error:"Betrieb, Name oder Rolle ungültig"});return true}
    const q=await pool.query(`INSERT INTO employees(restaurant_id,display_name,role,pin_hash)
      SELECT id,$2,$3,$4 FROM restaurants WHERE id=$1 AND company_id=$5
      RETURNING id,display_name,role,active`,[input.restaurantId,name,role,pin?passwordHash(pin):null,actor.company_id]);
    if(!q.rowCount){send(res,404,{error:"Betrieb nicht gefunden"});return true}
    send(res,201,q.rows[0]);return true;
  }
  const match=p.match(/^\/api\/v1\/admin\/team\/([^/]+)\/status$/);
  const roleMatch=p.match(/^\/api\/v1\/admin\/team\/([^/]+)\/role$/);
  if(roleMatch&&req.method==="PATCH"){
    if(!uuid.test(roleMatch[1])){send(res,400,{error:"Ungültiger Mitarbeiter"});return true}
    let input;try{input=await read(req)}catch{send(res,400,{error:"Ungültige Anfrage"});return true}
    const role=String(input.role||"");
    if(!["cashier","kitchen","manager"].includes(role)){send(res,400,{error:"Ungültige Rolle"});return true}
    const client=await pool.connect();
    try{
      await client.query("BEGIN");
      const employee=(await client.query(`SELECT e.id,e.role,e.user_id,e.active FROM employees e
        JOIN restaurants r ON r.id=e.restaurant_id WHERE e.id=$1 AND r.company_id=$2 FOR UPDATE OF e`,[roleMatch[1],actor.company_id])).rows[0];
      if(!employee){await client.query("ROLLBACK");send(res,404,{error:"Mitarbeiter nicht gefunden"});return true}
      if(employee.user_id){await client.query("ROLLBACK");send(res,409,{error:"Die Rolle eines Kontos mit eigener Anmeldung wird hier nicht geändert"});return true}
      if(employee.role!==role){
        await client.query("UPDATE employees SET role=$2 WHERE id=$1",[employee.id,role]);
        await client.query("INSERT INTO audit_log(company_id,actor_user_id,event_type,entity_type,entity_id,payload) VALUES($1,$2,'admin.employee.role','employee',$3,$4)",[actor.company_id,actor.id,employee.id,JSON.stringify({before:employee.role,after:role})]);
      }
      await client.query("COMMIT");send(res,200,{id:employee.id,role});return true;
    }catch(error){await client.query("ROLLBACK");throw error}finally{client.release()}
  }
  if(match&&req.method==="PATCH"){
    if(!uuid.test(match[1])){send(res,400,{error:"Ungültiger Mitarbeiter"});return true}
    let input;try{input=await read(req)}catch{send(res,400,{error:"Ungültige Anfrage"});return true}
    if(typeof input.active!=="boolean"){send(res,400,{error:"Status muss aktiv oder gesperrt sein"});return true}
    const client=await pool.connect();
    try{
      await client.query("BEGIN");
      const e=(await client.query(`SELECT e.id,e.restaurant_id,e.user_id,e.active,e.role FROM employees e JOIN restaurants r ON r.id=e.restaurant_id
        WHERE e.id=$1 AND r.company_id=$2 FOR UPDATE OF e`,[match[1],actor.company_id])).rows[0];
      if(!e){await client.query("ROLLBACK");send(res,404,{error:"Mitarbeiter nicht gefunden"});return true}
      if(e.user_id===actor.id){await client.query("ROLLBACK");send(res,409,{error:"Eigenen Zugang hier nicht deaktivieren"});return true}
      if(e.user_id&&input.active){const u=(await client.query("SELECT status FROM users WHERE id=$1 FOR UPDATE",[e.user_id])).rows[0];if(e.role==="waiter"&&u?.status==="disabled")await client.query("UPDATE users SET status='active' WHERE id=$1",[e.user_id]);else if(u?.status!=="active"){await client.query("ROLLBACK");send(res,409,{error:"Bitte zuerst das Benutzerkonto freigeben"});return true}}
      await client.query("UPDATE employees SET active=$2 WHERE id=$1",[e.id,input.active]);
      if(!input.active&&e.user_id){await client.query("DELETE FROM sessions WHERE user_id=$1",[e.user_id]);if(e.role==="waiter")await client.query("UPDATE users SET status='disabled' WHERE id=$1 AND role='waiter'",[e.user_id])}
      await client.query("INSERT INTO audit_log(company_id,actor_user_id,event_type,entity_type,entity_id,payload) VALUES($1,$2,'admin.employee.status','employee',$3,$4)",[actor.company_id,actor.id,e.id,JSON.stringify({before:e.active,after:input.active})]);
      await client.query("COMMIT");send(res,200,{id:e.id,active:input.active});return true;
    }catch(error){await client.query("ROLLBACK");throw error}finally{client.release()}
  }
  send(res,404,{error:"Admin-Funktion nicht gefunden"});return true;
}
