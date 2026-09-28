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
