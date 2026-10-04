import {sendSmtpMail} from './smtp-mail.js';
import {createMailProbe} from './ai-mail-health.js';
const adminMailStatus=createMailProbe();
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
  const origin=(returnTo==='ai'?(process.env.AI_PUBLIC_BASE_URL||process.env.PUBLIC_BASE_URL):(process.env.PUBLIC_BASE_URL||'https://bringness-pos.de')).replace(/\/$/,"");
  if(new URL(origin).protocol!=="https:")throw Error("Öffentliche Adresse muss HTTPS verwenden");
  const link=origin+"/admin/reset.html"+(returnTo==='ai'?"?returnTo=ai":"")+"#token="+token;
  const escape=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  await sendSmtpMail({
    from:process.env.SMTP_FROM,to:email,subject:"Bringness POS Admin – Passwort zurücksetzen",
    html:`<h1>Admin-Passwort zurücksetzen</h1><p><a href="${escape(link)}" style="display:inline-block;background:#183d35;color:#fff;padding:16px 24px;border-radius:24px;text-decoration:none">Neues Passwort festlegen</a></p><p>Der Button ist 30 Minuten gültig. Falls du diese Anfrage nicht gestellt hast, ignoriere diese E-Mail.</p>`,
    text:"Öffne diesen Link, um dein Admin-Passwort innerhalb von 30 Minuten neu zu setzen:\n\n"+link+"\n\nWenn du den Reset nicht angefordert hast, ignoriere diese Nachricht."
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
  if(path==="/api/v1/admin/password/forgot"&&req.method==="POST"){
    if(!mailConfigured()){send(res,503,{error:"E-Mail-Versand ist noch nicht eingerichtet. Bitte SMTP im Bringness-Server konfigurieren."});return true}
    let input;try{input=await body(req)}catch{send(res,400,{error:"Ungültige Anfrage"});return true}
    const email=String(input.email||"").trim().toLowerCase();
    if(email.length>254||!emailPattern.test(email)){send(res,400,{error:"Gültige E-Mail-Adresse erforderlich"});return true}
    const result=await pool.query("SELECT id FROM users WHERE email=$1 AND role IN ('owner','admin') AND status='active'",[email]);
    const user=result.rows[0];
    const generic={message:"Wenn ein aktives Admin-Konto mit dieser E-Mail existiert, erhält es einen Reset-Link."};
    if(!user){send(res,200,generic);return true}
    const recent=await pool.query("SELECT 1 FROM password_reset_tokens WHERE user_id=$1 AND created_at>now()-interval '2 minutes' AND used_at IS NULL",[user.id]);
    if(recent.rowCount){send(res,200,generic);return true}
    const token=crypto.randomBytes(32).toString("hex"),tokenHash=hash(token);
    await pool.query("INSERT INTO password_reset_tokens(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '30 minutes')",[tokenHash,user.id]);
    try{await sendResetMail(email,token,input.returnTo==='ai'?'ai':'pos')}
    catch(error){
      await pool.query("DELETE FROM password_reset_tokens WHERE token_hash=$1",[tokenHash]);
      console.error("Admin password reset mail delivery failed:",error.code||error.name);
      send(res,503,{error:"Reset-E-Mail konnte nicht versendet werden. Mailkonfiguration prüfen."});return true;
    }
    send(res,200,generic);return true;
  }
  if(path==="/api/v1/admin/password/reset"&&req.method==="POST"){
    let input;try{input=await body(req)}catch{send(res,400,{error:"Ungültige Anfrage"});return true}
    const token=String(input.token||""),password=String(input.password||"");
    if(!tokenPattern.test(token)||!validPassword(password)){
      send(res,400,{error:"Ungültiger Link oder Passwort. "+passwordMessage});return true;
    }
    const client=await pool.connect();
    try{
      await client.query("BEGIN");
      const row=(await client.query(`
        SELECT pr.token_hash,pr.user_id,u.company_id
        FROM password_reset_tokens pr JOIN users u ON u.id=pr.user_id
        WHERE pr.token_hash=$1 AND pr.used_at IS NULL AND pr.expires_at>now()
          AND u.role IN ('owner','admin') AND u.status='active'
        FOR UPDATE OF pr
      `,[hash(token)])).rows[0];
      if(!row){await client.query("ROLLBACK");send(res,400,{error:"Reset-Link ist ungültig oder abgelaufen"});return true}
      await client.query("UPDATE users SET password_hash=$2,must_change_password=false WHERE id=$1",[row.user_id,passwordHash(password)]);
      await client.query("UPDATE password_reset_tokens SET used_at=now() WHERE token_hash=$1",[row.token_hash]);
      await client.query("DELETE FROM password_reset_tokens WHERE user_id=$1 AND token_hash<>$2",[row.user_id,row.token_hash]);
      await client.query("DELETE FROM sessions WHERE user_id=$1",[row.user_id]);
      await client.query("INSERT INTO audit_log(company_id,actor_user_id,event_type,entity_type,entity_id) VALUES($1,$2,'admin.password.reset','user',$3)",[row.company_id,row.user_id,row.user_id]);
      await client.query("COMMIT");
      send(res,200,{message:"Passwort geändert. Alle bisherigen Sitzungen wurden abgemeldet."});return true;
    }catch(error){await client.query("ROLLBACK");throw error}finally{client.release()}
  }
  return false;
}

export async function requireAdminPasswordChange(req,res){
  const path=new URL(req.url,"http://localhost").pathname;
  if(!path.startsWith("/api/v1/")||[
    "/api/v1/auth/login","/api/v1/auth/logout","/api/v1/profile/password",
    "/api/v1/admin/password/change","/api/v1/admin/password/first-login"
  ].includes(path))return false;
  const bearer=String(req.headers.authorization||"").replace(/^Bearer\s+/i,"");
  if(!bearer)return false;
  const q=await pool.query(`SELECT u.must_change_password FROM sessions s JOIN users u ON u.id=s.user_id
    WHERE s.token_hash=$1 AND s.expires_at>now() AND u.status='active' AND u.role='admin'`,[hash(bearer)]);
  if(!q.rows[0]?.must_change_password)return false;
  send(res,428,{error:"Bitte zuerst das Startpasswort ändern",mustChangePassword:true});return true;
}


