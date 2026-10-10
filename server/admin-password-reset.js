import {clearLoginAttempts} from './auth-attempts.js';
import {sendSmtpMail} from './smtp-mail.js';
import {createMailProbe} from './ai-mail-health.js';
const adminMailStatus=createMailProbe();
let recoverySchema;
function ensureRecoverySchema(){if(!recoverySchema)recoverySchema=pool.query("ALTER TABLE password_reset_tokens ADD COLUMN IF NOT EXISTS delivered_at timestamptz").catch(error=>{recoverySchema=null;throw error});return recoverySchema;}
import {validPassword,passwordMessage} from "./password-policy.js";
import crypto from "node:crypto";
import pg from "pg";

const pool=new pg.Pool({
  connectionString:process.env.DATABASE_URL,
  ssl:process.env.NODE_ENV==="production"?{rejectUnauthorized:false}:false
});
const tokenPattern=/^[a-f0-9]{64}$/;
const emailPattern=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const passwordHash=password=>crypto.scryptSync(password,process.env.PASSWORD_PEPPER||"bringness-pos",64).toString("hex");
const hash=value=>crypto.createHash("sha256").update(value).digest("hex");
function send(res,status,value){
  res.writeHead(status,{"content-type":"application/json","cache-control":"no-store"});
  res.end(JSON.stringify(value));
}
async function body(req){
  let raw="";
  for await(const chunk of req){
    raw+=chunk;
    if(raw.length>8192)throw Error("Anfrage zu groß");
  }
  return raw?JSON.parse(raw):{};
}
function mailConfigured(){
  return Boolean(process.env.SMTP_HOST&&process.env.SMTP_USER&&process.env.SMTP_PASSWORD&&process.env.SMTP_FROM);
}
async function sendResetMail(email,token,returnTo){
  const origin=(returnTo==='ai'?(process.env.AI_PUBLIC_BASE_URL||process.env.PUBLIC_BASE_URL):(process.env.PUBLIC_BASE_URL||'https://bringness.de')).replace(/\/$/,"");
  if(new URL(origin).protocol!=="https:")throw Error("Öffentliche Adresse muss HTTPS verwenden");
  const link=origin+"/admin/reset.html"+(returnTo==='ai'?"?returnTo=ai":returnTo==='service'?"?returnTo=service":returnTo==='pos-login'?"?returnTo=pos":"")+"#token="+token;
  const escape=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  await sendSmtpMail({
    from:process.env.SMTP_FROM,to:email,subject:returnTo==='service'?"Bringness – Zugangscode zurücksetzen":returnTo==='pos-login'?"Bringness – Passwort zurücksetzen":"Bringness Admin – Passwort zurücksetzen",
    html:`<h1>Passwort zurücksetzen</h1><p><a href="${escape(link)}" style="display:inline-block;background:#183d35;color:#fff;padding:16px 24px;border-radius:24px;text-decoration:none">Neues Passwort festlegen</a></p><p>Der Button ist 30 Minuten gültig. Falls du diese Anfrage nicht gestellt hast, ignoriere diese E-Mail.</p>`,
    text:"Öffne diesen Link, um dein Passwort innerhalb von 30 Minuten neu zu setzen:\n\n"+link+"\n\nWenn du den Reset nicht angefordert hast, ignoriere diese Nachricht."
  });
}

export async function handleAdminPasswordReset(req,res){
  const path=new URL(req.url,"http://localhost").pathname;
  if(path==="/api/v1/admin/password/first-login"&&req.method==="GET"){
    const bearer=String(req.headers.authorization||"").replace(/^Bearer\s+/i,"");
    if(!bearer){send(res,401,{error:"Bitte anmelden"});return true}
    const q=await pool.query(`SELECT u.must_change_password FROM sessions s JOIN users u ON u.id=s.user_id
      WHERE s.token_hash=$1 AND s.expires_at>now() AND u.status='active' AND u.role IN ('owner','admin')`,[hash(bearer)]);
    if(!q.rowCount){send(res,403,{error:"Kein aktiver Admin-Zugang"});return true}
    send(res,200,{required:q.rows[0].must_change_password});return true;
  }
  if(path==="/api/v1/admin/password/change"&&req.method==="POST"){
    const bearer=String(req.headers.authorization||"").replace(/^Bearer\s+/i,"");
    if(!bearer){send(res,401,{error:"Bitte anmelden"});return true}
    const session=await pool.query(`SELECT u.id,u.company_id,u.password_hash FROM sessions s JOIN users u ON u.id=s.user_id
      WHERE s.token_hash=$1 AND s.expires_at>now() AND u.status='active' AND u.role IN ('owner','admin')`,[hash(bearer)]);
    const user=session.rows[0];
    if(!user){send(res,403,{error:"Kein aktiver Admin-Zugang"});return true}
    let input;try{input=await body(req)}catch{send(res,400,{error:"Ungültige Anfrage"});return true}
    const current=String(input.currentPassword||""),next=String(input.newPassword||"");
    if(current.length>128||!validPassword(next)){send(res,400,{error:passwordMessage});return true}
    const given=Buffer.from(passwordHash(current),"hex"),stored=Buffer.from(user.password_hash,"hex");
    if(given.length!==stored.length||!crypto.timingSafeEqual(given,stored)){send(res,403,{error:"Bisheriges Passwort ist falsch"});return true}
    if(current===next){send(res,400,{error:"Bitte ein anderes Passwort wählen"});return true}
    const client=await pool.connect();
    try{
      await client.query("BEGIN");
      const updated=await client.query("UPDATE users SET password_hash=$2,must_change_password=false WHERE id=$1 AND password_hash=$3",[user.id,passwordHash(next),user.password_hash]);
      if(!updated.rowCount){await client.query("ROLLBACK");send(res,409,{error:"Passwort wurde inzwischen geändert. Bitte erneut anmelden."});return true}
      await client.query("DELETE FROM sessions WHERE user_id=$1",[user.id]);
      await client.query("DELETE FROM password_reset_tokens WHERE user_id=$1",[user.id]);
      await client.query("INSERT INTO audit_log(company_id,actor_user_id,event_type,entity_type,entity_id) VALUES($1,$2,'admin.password.changed','user',$3)",[user.company_id,user.id,user.id]);
      await client.query("COMMIT");
      send(res,200,{message:"Passwort geändert. Bitte erneut anmelden."});return true;
    }catch(error){await client.query("ROLLBACK");throw error}finally{client.release()}
  }
  if(path==="/api/v1/admin/password/availability"&&req.method==="GET"){
    const state=await adminMailStatus();send(res,200,{emailAvailable:state.available,status:state.status});return true;
  }
  const posRecovery=["/api/v1/auth/forgot-password","/api/v1/auth/reset-password","/api/v1/auth/reset-password/details"].includes(path);
  const eligibleRoles=posRecovery?"true":"u.role IN ('owner','admin')";
  if(path==="/api/v1/auth/reset-password/details"&&req.method==="POST"){
    let input;try{input=await body(req)}catch{send(res,400,{error:"Ungültige Anfrage"});return true}
    const token=String(input.token||"");
    if(!tokenPattern.test(token)){send(res,400,{error:"Reset-Link ist ungültig oder abgelaufen"});return true}
    const result=await pool.query("SELECT u.role FROM password_reset_tokens pr JOIN users u ON u.id=pr.user_id WHERE pr.token_hash=$1 AND pr.used_at IS NULL AND pr.expires_at>now() AND u.status='active'",[hash(token)]);
    if(!result.rows.length){send(res,400,{error:"Reset-Link ist ungültig oder abgelaufen"});return true}
    const pin=result.rows[0].role==='waiter';
    send(res,200,{credentialType:pin?'pin':'password',loginPath:pin?'/service/':'/pos/'});return true;
  }
  if((path==="/api/v1/admin/password/forgot"||path==="/api/v1/auth/forgot-password")&&req.method==="POST"){
    await ensureRecoverySchema();
    if(!mailConfigured()){send(res,503,{error:"E-Mail-Versand ist noch nicht eingerichtet. Bitte SMTP im Bringness-Server konfigurieren."});return true}
    let input;try{input=await body(req)}catch{send(res,400,{error:"Ungültige Anfrage"});return true}
    const email=String(input.email||"").trim().toLowerCase();
    if(email.length>254||!emailPattern.test(email)){send(res,400,{error:"Gültige E-Mail-Adresse erforderlich"});return true}
    const result=await pool.query(`SELECT u.id,u.email,u.role FROM users u WHERE lower(btrim(u.email))=$1 AND ${eligibleRoles} AND u.status='active'`,[email]);
    const user=result.rows.length===1?result.rows[0]:null;
    const generic={message:posRecovery?"Wenn ein aktives Konto mit dieser E-Mail existiert, erhältst du einen Link zum Zurücksetzen. Bitte prüfe auch den Spamordner.":"Wenn ein aktives Admin-Konto mit dieser E-Mail existiert, erhält es einen Reset-Link."};
    if(!user){send(res,200,generic);return true}
    const recent=await pool.query("SELECT 1 FROM password_reset_tokens WHERE user_id=$1 AND created_at>now()-interval '2 minutes' AND used_at IS NULL AND delivered_at IS NOT NULL",[user.id]);
    if(recent.rowCount){send(res,200,generic);return true}
    const token=crypto.randomBytes(32).toString("hex"),tokenHash=hash(token);
    await pool.query("INSERT INTO password_reset_tokens(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '30 minutes')",[tokenHash,user.id]);
    try{await sendResetMail(user.email,token,posRecovery?(user.role==='waiter'?'service':'pos-login'):input.returnTo==='ai'?'ai':'pos');await pool.query('UPDATE password_reset_tokens SET delivered_at=now() WHERE token_hash=$1',[tokenHash])}
    catch(error){
      await pool.query("DELETE FROM password_reset_tokens WHERE token_hash=$1",[tokenHash]);
      console.error("Admin password reset mail delivery failed:",error.code||error.name);
      send(res,503,{error:"Reset-E-Mail konnte nicht versendet werden. Mailkonfiguration prüfen."});return true;
    }
    send(res,200,generic);return true;
  }
  if((path==="/api/v1/admin/password/reset"||path==="/api/v1/auth/reset-password")&&req.method==="POST"){
    let input;try{input=await body(req)}catch{send(res,400,{error:"Ungültige Anfrage"});return true}
    const token=String(input.token||""),password=String(input.password||"");
    if(!tokenPattern.test(token)||!password.length||password.length>128){
      send(res,400,{error:"Ungültiger Link oder neue Eingabe."});return true;
    }
    const client=await pool.connect();
    try{
      await client.query("BEGIN");
      const row=(await client.query(`
        SELECT pr.token_hash,pr.user_id,u.company_id,u.email,u.role
        FROM password_reset_tokens pr JOIN users u ON u.id=pr.user_id
        WHERE pr.token_hash=$1 AND pr.used_at IS NULL AND pr.expires_at>now()
          AND ${eligibleRoles} AND u.status='active'
        FOR UPDATE OF pr, u
      `,[hash(token)])).rows[0];
      if(!row){await client.query("ROLLBACK");send(res,400,{error:"Reset-Link ist ungültig oder abgelaufen"});return true}
      const pin=posRecovery&&row.role==='waiter';
      if(pin?!/^\d{6}$/.test(password):!validPassword(password)){
        await client.query("ROLLBACK");send(res,400,{error:pin?"Der neue Zugangscode muss genau 6 Ziffern enthalten.":passwordMessage});return true;
      }
      await client.query("UPDATE users SET password_hash=$2,must_change_password=false WHERE id=$1",[row.user_id,passwordHash(password)]);
      await client.query("UPDATE password_reset_tokens SET used_at=now() WHERE token_hash=$1",[row.token_hash]);
      await client.query("DELETE FROM password_reset_tokens WHERE user_id=$1 AND token_hash<>$2",[row.user_id,row.token_hash]);
      await client.query("DELETE FROM sessions WHERE user_id=$1",[row.user_id]);
      await client.query("INSERT INTO audit_log(company_id,actor_user_id,event_type,entity_type,entity_id) VALUES($1,$2,'admin.password.reset','user',$3)",[row.company_id,row.user_id,row.user_id]);
      await client.query("COMMIT");
      clearLoginAttempts(row.email);
      send(res,200,{message:(pin?"Zugangscode":"Passwort")+" geändert. Alle bisherigen Sitzungen wurden abgemeldet."});return true;
    }catch(error){await client.query("ROLLBACK");throw error}finally{client.release()}
  }
  return false;
}

export async function requireAdminPasswordChange(req,res){
  const path=new URL(req.url,"http://localhost").pathname;
  if(!path.startsWith("/api/v1/")||[
    "/api/v1/auth/login","/api/v1/auth/logout","/api/v1/profile/password",
    "/api/v1/auth/forgot-password","/api/v1/auth/reset-password","/api/v1/auth/reset-password/details",
    "/api/v1/admin/password/forgot","/api/v1/admin/password/reset","/api/v1/admin/password/availability",
    "/api/v1/admin/password/change","/api/v1/admin/password/first-login"
  ].includes(path))return false;
  const bearer=String(req.headers.authorization||"").replace(/^Bearer\s+/i,"");
  if(!bearer)return false;
  const q=await pool.query(`SELECT u.must_change_password FROM sessions s JOIN users u ON u.id=s.user_id
    WHERE s.token_hash=$1 AND s.expires_at>now() AND u.status='active' AND u.role='admin'`,[hash(bearer)]);
  if(!q.rows[0]?.must_change_password)return false;
  send(res,428,{error:"Bitte zuerst das Startpasswort ändern",mustChangePassword:true});return true;
}




