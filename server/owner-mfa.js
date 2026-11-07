import crypto from 'node:crypto';
import QRCode from 'qrcode';
import {readJsonObject} from './http-body.js';
import {legacyPasswordHash} from './secret-derivation.js';
import {base32,digest,mfaCipher,newRecovery,recoveryCode,recoveryHash,verifyTotp} from './owner-mfa-crypto.js';
const base='/api/v1/platform/security';
const bearer=req=>/^Bearer ([a-f0-9]{64})$/i.exec(req.headers.authorization||'')?.[1]||'';
const error=(status,message)=>Object.assign(Error(message),{status});
function send(res,status,data){res.writeHead(status,{'content-type':'application/json','cache-control':'no-store','referrer-policy':'no-referrer','x-content-type-options':'nosniff'});res.end(JSON.stringify(data));return true}
// Runs inside issueLoginSession's existing credential/status account lock.
export async function ownerLoginChallenge(db,account){
 const state=(await db.query('SELECT revision FROM platform_owner_mfa WHERE user_id=$1 AND enabled=true FOR UPDATE',[account.id])).rows[0];
 if(!state)return null;
 const challenge=crypto.randomBytes(32).toString('hex');
 await db.query('DELETE FROM platform_mfa_challenges WHERE user_id=$1 AND (expires_at<=now() OR token_hash IN (SELECT token_hash FROM platform_mfa_challenges WHERE user_id=$1 ORDER BY created_at DESC OFFSET 4))',[account.id]);
 await db.query("INSERT INTO platform_mfa_challenges(token_hash,user_id,password_fingerprint,revision,expires_at) VALUES($1,$2,$3,$4,now()+interval '5 minutes')",[digest(challenge),account.id,digest(account.password_hash+':'+account.role),state.revision]);
 return {mfaRequired:true,challenge};
}
export function createOwnerMfa(pool,{keyMaterial=process.env.OWNER_MFA_KEY||process.env.PASSWORD_PEPPER||process.env.DATABASE_URL,passwordHash=legacyPasswordHash,now=Date.now,qr=value=>QRCode.toDataURL(value,{width:280,margin:2})}={}){
 const cipher=mfaCipher(keyMaterial);
 const open=(value,user)=>{if(!cipher)throw error(503,'Die geschützte Konfiguration für die Anmeldung fehlt.');try{return cipher.open(value,user)}catch{throw error(503,'Die geschützte Konfiguration kann nicht gelesen werden. Bitte den Support kontaktieren.')}};
 async function owner(db,id){return (await db.query("SELECT u.id,u.company_id,u.password_hash,u.role,u.must_change_password FROM users u JOIN platform_owner o ON o.user_id=u.id JOIN platform_admins a ON a.user_id=u.id AND a.active=true WHERE u.id=$1 AND u.status='active' FOR UPDATE OF u FOR SHARE OF a",[id])).rows[0]}
 async function state(db,user){await db.query('INSERT INTO platform_owner_mfa(user_id) VALUES($1) ON CONFLICT(user_id) DO NOTHING',[user]);return (await db.query("SELECT *,failure_window>clock_timestamp()-interval '15 minutes' AS recent_failures FROM platform_owner_mfa WHERE user_id=$1 FOR UPDATE",[user])).rows[0]}
 const blocked=s=>s.recent_failures&&s.failed_count>=10;
 async function bad(db,user,message='Der Code ist ungültig oder wurde bereits verwendet.'){await db.query("UPDATE platform_owner_mfa SET failed_count=CASE WHEN failure_window>clock_timestamp()-interval '15 minutes' THEN failed_count+1 ELSE 1 END,failure_window=CASE WHEN failure_window>clock_timestamp()-interval '15 minutes' THEN failure_window ELSE clock_timestamp() END WHERE user_id=$1",[user]);return {status:400,data:{error:message}}}
 async function password(input,account){if(typeof input.password!=='string'||input.password.length>128||!input.password)return false;const actual=await passwordHash(input.password);return actual.length===account.password_hash.length&&crypto.timingSafeEqual(Buffer.from(actual),Buffer.from(account.password_hash))}
 async function factor(db,s,code){
  const recovery=recoveryCode(code);
  if(recovery){const hash=recoveryHash(s.user_id,recovery);if(!s.recovery_hashes.includes(hash))return null;await db.query('UPDATE platform_owner_mfa SET recovery_hashes=array_remove(recovery_hashes,$2),failed_count=0 WHERE user_id=$1',[s.user_id,hash]);return 'recovery'}
  const step=verifyTotp(open(s.secret_cipher,s.user_id),String(code||''),s.last_step,now());if(step===null)return null;
  await db.query('UPDATE platform_owner_mfa SET last_step=$2,failed_count=0 WHERE user_id=$1',[s.user_id,step]);return 'totp';
 }
 async function audit(db,user,type){await db.query("INSERT INTO audit_log(company_id,actor_user_id,event_type,entity_type,entity_id) VALUES($1,$2,$3,'user',$4)",[user.company_id,user.id,type,user.id])}
 return async(req,res)=>{
  const path=new URL(req.url,'http://local').pathname;
  if(path==='/api/v1/auth/logout'&&req.method==='POST'){const raw=bearer(req);if(!raw)return send(res,401,{error:'Bitte anmelden.'});await pool.query('DELETE FROM sessions WHERE token_hash=$1',[digest(raw)]);return send(res,200,{ok:true})}
  if(!path.startsWith(base+'/'))return false;
  if(!['GET','POST'].includes(req.method))return send(res,405,{error:'Methode nicht erlaubt.'});
  const action=path.slice(base.length+1);if(!['status','begin','activate','disable','verify-login'].includes(action))return send(res,404,{error:'Nicht gefunden.'});
  if((action==='status')!==(req.method==='GET'))return send(res,405,{error:'Methode nicht erlaubt.'});
  const db=await pool.connect();
  try{
   const input=req.method==='POST'?await readJsonObject(req,{maxBytes:8192}):{};
   await db.query('BEGIN');await db.query("SET LOCAL statement_timeout='5s'");
   let user,session,challenge;
   if(action==='verify-login'){
    if(!/^[a-f0-9]{64}$/.test(String(input.challenge||'')))throw error(401,'Bitte erneut mit E-Mail und Passwort anmelden.');
    const pending=(await db.query('SELECT user_id FROM platform_mfa_challenges WHERE token_hash=$1 AND expires_at>clock_timestamp()',[digest(input.challenge)])).rows[0];
    if(pending)user=await owner(db,pending.user_id);
    if(!user)throw error(401,'Bitte erneut mit E-Mail und Passwort anmelden.');
    challenge=(await db.query('SELECT * FROM platform_mfa_challenges WHERE token_hash=$1 AND expires_at>clock_timestamp() FOR UPDATE',[digest(input.challenge)])).rows[0];
    if(!challenge||challenge.password_fingerprint!==digest(user.password_hash+':'+user.role)||challenge.attempts>=5)throw error(401,'Bitte erneut mit E-Mail und Passwort anmelden.');
   }else{
    const raw=bearer(req);if(!raw)throw error(401,'Bitte zuerst im Superadmin anmelden.');
    const found=(await db.query('SELECT user_id FROM sessions WHERE token_hash=$1 AND expires_at>clock_timestamp()',[digest(raw)])).rows[0];
    if(found)user=await owner(db,found.user_id);
    if(!user)throw error(403,'Dieser Bereich ist ausschließlich für den persönlichen Eigentümerzugang.');
    if(user.must_change_password)throw error(428,'Bitte zuerst das vorläufige Passwort ändern.');
    session=(await db.query('SELECT token_hash,expires_at FROM sessions WHERE token_hash=$1 AND user_id=$2 AND expires_at>clock_timestamp() FOR UPDATE',[digest(raw),user.id])).rows[0];
    if(!session)throw error(401,'Bitte erneut anmelden.');
   }
   const s=await state(db,user.id);let result;
   const recentRecovery=session?(await db.query("SELECT 1 FROM platform_mfa_verified WHERE token_hash=$1 AND method='recovery' AND verified_at>clock_timestamp()-interval '5 minutes'",[session.token_hash])).rows.length>0:false;
   if(action==='status')result={status:200,data:{enabled:s.enabled,recoveryRemaining:s.recovery_hashes.length,setupAvailable:Boolean(cipher),recentRecovery}};
   else if(blocked(s))result={status:429,data:{error:'Zu viele fehlgeschlagene Versuche. Bitte nach 15 Minuten erneut versuchen.'}};
   else if(action==='verify-login'){
    if(!s.enabled||String(s.revision)!==String(challenge.revision))throw error(401,'Die Sicherheitseinstellungen wurden geändert. Bitte neu anmelden.');
    const method=await factor(db,s,input.code);
    if(!method){await db.query('UPDATE platform_mfa_challenges SET attempts=attempts+1 WHERE token_hash=$1',[challenge.token_hash]);result=await bad(db,user.id)}
    else{
     const token=crypto.randomBytes(32).toString('hex'),hash=digest(token);
     const expiry=(await db.query("SELECT clock_timestamp()+interval '12 hours' AS until")).rows[0].until;
     await db.query('INSERT INTO platform_mfa_verified(token_hash,user_id,expires_at,method) VALUES($1,$2,$3,$4)',[hash,user.id,expiry,method]);
     await db.query('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,$3)',[hash,user.id,expiry]);
     await db.query('DELETE FROM platform_mfa_challenges WHERE token_hash=$1',[challenge.token_hash]);
     if(method==='recovery')await audit(db,user,'platform.mfa.recovery.used');
     result={status:200,data:{token,recoveryUsed:method==='recovery'}};
    }
   }else if(!await password(input,user))result=await bad(db,user.id,'Das aktuelle Passwort ist nicht korrekt.');
   else if(action==='begin'){
    if(s.enabled)throw error(409,'Die Zwei-Faktor-Anmeldung ist bereits aktiv.');
    if(!cipher)throw error(503,'Die geschützte Konfiguration für die Anmeldung fehlt.');
    const secret=base32(crypto.randomBytes(20)),enrollment=crypto.randomBytes(32).toString('hex'),recovery=newRecovery(user.id);
    const image=await qr('otpauth://totp/Bringness:Eigentuemer?secret='+secret+'&issuer=Bringness&algorithm=SHA1&digits=6&period=30');
    await db.query("UPDATE platform_owner_mfa SET pending_cipher=$2,pending_id=$3,pending_session=$4,pending_until=clock_timestamp()+interval '10 minutes',pending_recovery_hashes=$5 WHERE user_id=$1",[user.id,cipher.seal(secret,user.id),digest(enrollment),session.token_hash,recovery.hashes]);
    result={status:200,data:{enrollment,secret,qr:image,recoveryCodes:recovery.codes}};
   }else if(action==='activate'){
    if(s.enabled)throw error(409,'Die Zwei-Faktor-Anmeldung ist bereits aktiv. Bitte den Status neu laden.');
    if(!s.pending_id||s.pending_id!==digest(String(input.enrollment||''))||s.pending_session!==session.token_hash||!s.pending_until||new Date(s.pending_until).getTime()<=Date.now())throw error(409,'Die Einrichtung ist abgelaufen. Bitte neu beginnen.');
    if(input.saved!==true)throw error(400,'Bitte zuerst die Wiederherstellungscodes sicher speichern.');
    const step=verifyTotp(open(s.pending_cipher,user.id),String(input.code||''),-1,now());
    if(step===null)result=await bad(db,user.id);
    else{
     const expiry=(await db.query("SELECT least($1::timestamptz,clock_timestamp()+interval '12 hours') AS until",[session.expires_at])).rows[0].until;
     await db.query("INSERT INTO platform_mfa_verified(token_hash,user_id,expires_at,method) VALUES($1,$2,$3,'totp') ON CONFLICT(token_hash) DO UPDATE SET expires_at=EXCLUDED.expires_at,verified_at=clock_timestamp(),method='totp'",[session.token_hash,user.id,expiry]);
     await db.query("UPDATE platform_owner_mfa SET enabled=true,secret_cipher=pending_cipher,recovery_hashes=pending_recovery_hashes,pending_cipher=NULL,pending_id=NULL,pending_session=NULL,pending_until=NULL,pending_recovery_hashes='{}',last_step=$2,revision=revision+1,failed_count=0 WHERE user_id=$1",[user.id,step]);
     await db.query('DELETE FROM sessions WHERE user_id=$1 AND token_hash<>$2',[user.id,session.token_hash]);
     await db.query('UPDATE sessions SET expires_at=$2 WHERE token_hash=$1',[session.token_hash,expiry]);
     await db.query('DELETE FROM platform_mfa_challenges WHERE user_id=$1',[user.id]);
     await audit(db,user,'platform.mfa.enabled');result={status:200,data:{enabled:true}};
    }
   }else if(action==='disable'){
    if(input.confirm!==true)throw error(400,'Bitte die Deaktivierung ausdrücklich bestätigen.');
    if(!s.enabled)throw error(409,'Die Zwei-Faktor-Anmeldung ist nicht aktiv.');
    const method=input.code?await factor(db,s,input.code):recentRecovery?'recovery':null;
    if(!method)result=await bad(db,user.id);
    else{
     await db.query("UPDATE platform_owner_mfa SET enabled=false,secret_cipher=NULL,pending_cipher=NULL,pending_id=NULL,pending_session=NULL,pending_until=NULL,recovery_hashes='{}',pending_recovery_hashes='{}',revision=revision+1,failed_count=0 WHERE user_id=$1",[user.id]);
     await db.query('DELETE FROM sessions WHERE user_id=$1 AND token_hash<>$2',[user.id,session.token_hash]);
     await db.query('DELETE FROM platform_mfa_verified WHERE user_id=$1',[user.id]);
     await db.query('DELETE FROM platform_mfa_challenges WHERE user_id=$1',[user.id]);
     await audit(db,user,'platform.mfa.disabled');result={status:200,data:{enabled:false}};
    }
   }
   await db.query('COMMIT');return send(res,result.status,result.data);
  }catch(e){await db.query('ROLLBACK').catch(()=>{});if(e.status)return send(res,e.status,{error:e.message});throw e}finally{db.release()}
 }
}
