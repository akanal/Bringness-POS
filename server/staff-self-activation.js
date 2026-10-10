import crypto from 'node:crypto';
import {enqueueMail,cleanMailAddress} from './transactional-mail.js';
import {validPassword,passwordMessage} from './password-policy.js';
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const passwordHash=x=>crypto.scryptSync(x,process.env.PASSWORD_PEPPER||'bringness-pos',64).toString('hex');
const pinHash=x=>{const salt=crypto.randomBytes(16).toString('hex');return salt+':'+crypto.scryptSync(x,salt,64).toString('hex')};
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status})};
const send=(res,status,data)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(data));return true};
export async function createStaffInvitation(c,{companyId,restaurantId,name,email,role,restaurantName}){
 if(!['cashier','kitchen','manager','waiter'].includes(role))fail('Ungültige Mitarbeiterrolle');
 email=cleanMailAddress(email);if(!email)fail('Gültige E-Mail erforderlich');
 if(!process.env.SMTP_HOST||!process.env.SMTP_USER||!process.env.SMTP_PASSWORD||!process.env.SMTP_FROM)fail('Einladungs-E-Mail ist noch nicht eingerichtet.',503);
 const origin=new URL(process.env.PUBLIC_BASE_URL||'https://bringness.de');if(origin.protocol!=='https:')fail('Öffentliche HTTPS-Adresse fehlt',503);
 const token=crypto.randomBytes(32).toString('hex');
 // An unshared random credential prevents login until the recipient completes setup.
 const user=(await c.query("INSERT INTO users(company_id,email,password_hash,display_name,status,role,must_change_password) VALUES($1,$2,$3,$4,'pending',$5,true) RETURNING id",[companyId,email,passwordHash(crypto.randomBytes(32).toString('hex')),name,role])).rows[0];
 const employee=(await c.query("INSERT INTO employees(restaurant_id,display_name,role,active,user_id) VALUES($1,$2,$3,true,$4) RETURNING id,display_name,active",[restaurantId,name,role,user.id])).rows[0];
 await queueStaffInvitation(c,{userId:user.id,name,email,restaurantName,token,origin:origin.origin});
 return {employee,user};
}
async function queueStaffInvitation(c,{userId,name,email,restaurantName,token,origin}){
 await c.query("INSERT INTO staff_invitations(token_hash,user_id,expires_at,self_setup) VALUES($1,$2,now()+interval '48 hours',true)",[sha(token),userId]);
 await enqueueMail(c,'staff:'+userId+':'+sha(token),email,{expiresAt:new Date(Date.now()+48*3600000).toISOString(),subject:'Bringness – Mitarbeiterzugang einrichten',text:`Hallo ${name},\n\n${restaurantName} hat dich als Mitarbeiter eingeladen. Öffne innerhalb von 48 Stunden diesen persönlichen Link und lege deinen Zugang und deine Stempel-PIN selbst fest:\n${origin}/staff/activate.html#token=${token}\n\nDanach kannst du dich anmelden. Deine Rolle wird vom Inhaber vorgegeben. Teile den Link nicht. Falls du keine Einladung erwartet hast, ignoriere diese E-Mail.`});
}
export async function resendStaffInvitation(c,{companyId,restaurantId,employeeId}){
 if(!['SMTP_HOST','SMTP_USER','SMTP_PASSWORD','SMTP_FROM'].every(k=>process.env[k]))fail('Einladungs-E-Mail ist noch nicht eingerichtet.',503);
 const origin=new URL(process.env.PUBLIC_BASE_URL||'https://bringness.de');if(origin.protocol!=='https:')fail('Öffentliche HTTPS-Adresse fehlt',503);
 const row=(await c.query("SELECT u.id,u.email,e.display_name,r.name FROM employees e JOIN users u ON u.id=e.user_id JOIN restaurants r ON r.id=e.restaurant_id WHERE e.id=$1 AND e.restaurant_id=$2 AND r.company_id=$3 AND u.company_id=$3 AND u.status='pending' AND e.active=true FOR UPDATE OF u",[employeeId,restaurantId,companyId])).rows[0];
 if(!row)fail('Keine offene Einladung für diesen Mitarbeiter',404);
 if((await c.query("SELECT 1 FROM staff_invitations WHERE user_id=$1 AND created_at>now()-interval '1 minute' LIMIT 1",[row.id])).rows[0])fail('Bitte eine Minute warten, bevor du die Einladung erneut sendest.',429);
 await c.query('UPDATE staff_invitations SET used_at=now() WHERE user_id=$1 AND used_at IS NULL',[row.id]);
 await c.query("UPDATE transactional_mail SET status='failed',last_error='invitation_replaced',payload='' WHERE dedupe_key LIKE $1 AND status='pending'",['staff:'+row.id+'%']);
 await queueStaffInvitation(c,{userId:row.id,name:row.display_name,email:row.email,restaurantName:row.name,token:crypto.randomBytes(32).toString('hex'),origin:origin.origin});
}
export async function activateStaff(pool,{token,password,stampPin},details=false){
 if(!/^[a-f0-9]{64}$/.test(String(token||'')))fail('Aktivierungslink ungültig oder abgelaufen');
 const c=await pool.connect();try{
 await c.query('BEGIN');
 const row=(await c.query("SELECT i.user_id,u.role FROM staff_invitations i JOIN users u ON u.id=i.user_id WHERE i.token_hash=$1 AND i.used_at IS NULL AND i.expires_at>now() AND i.self_setup=true AND u.status='pending' FOR UPDATE OF i,u",[sha(token)])).rows[0];
 if(!row)fail('Aktivierungslink ungültig oder abgelaufen');
 const loginPath=row.role==='waiter'?'/service/':'/pos/';
 if(details){await c.query('COMMIT');return {credentialType:row.role==='waiter'?'pin':'password',loginPath}}
 if(row.role==='waiter'?!/^\d{6}$/.test(String(password||'')):!validPassword(password))fail(row.role==='waiter'?'Der Zugangscode muss genau 6 Ziffern enthalten.':passwordMessage);
 const pin=row.role==='waiter'?password:String(stampPin||'');if(!/^\d{6,8}$/.test(pin))fail('Die persönliche Stempel-PIN muss 6 bis 8 Ziffern enthalten.');
 const employee=await c.query('UPDATE employees SET pin_hash=$2 WHERE user_id=$1 AND active=true RETURNING id',[row.user_id,pinHash(pin)]);if(!employee.rowCount)fail('Mitarbeiterzugang nicht verfügbar');
 await c.query("UPDATE users SET password_hash=$2,status='active',must_change_password=false WHERE id=$1",[row.user_id,passwordHash(password)]);
 await c.query('UPDATE staff_invitations SET used_at=now() WHERE user_id=$1 AND used_at IS NULL',[row.user_id]);
 await c.query('DELETE FROM sessions WHERE user_id=$1',[row.user_id]);
 await c.query('COMMIT');return {message:'Dein Zugang ist eingerichtet.',loginPath};
 }catch(error){await c.query('ROLLBACK');throw error}finally{c.release()}
}
export async function handleStaffActivation(pool,req,res){
 const path=new URL(req.url,'http://local').pathname;
 if(!['/api/v1/staff/activate','/api/v1/staff/activate/details'].includes(path)||req.method!=='POST')return false;
 try{let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>8192)fail('Anfrage zu groß',413)}let b;try{b=JSON.parse(raw||'{}')}catch{fail('Ungültige Anfrage')}
 return send(res,200,await activateStaff(pool,b,path.endsWith('/details')));
 }catch(e){if(e.status)return send(res,e.status,{error:e.message});throw e}
}
