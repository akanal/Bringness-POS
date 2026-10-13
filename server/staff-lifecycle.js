import {validPassword,passwordMessage} from './password-policy.js';
import crypto from 'node:crypto';
import {pinHash} from './personnel.js';
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const pass=x=>crypto.scryptSync(x,process.env.PASSWORD_PEPPER||'bringness-pos',64).toString('hex');
const reply=(res,status,value)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(value));return true};
async function input(req){let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>8192)throw Object.assign(Error('Anfrage zu groß'),{status:413})}try{return raw?JSON.parse(raw):{}}catch{throw Object.assign(Error('Ungültige Anfrage'),{status:400})}}
export function createStaffLifecycle(pool){return async function(req,res){
 const path=new URL(req.url,'http://local').pathname,action=/^\/api\/v1\/waiters\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/(disable|delete)$/i.exec(path);
 if(!(path==='/api/v1/staff/confirm'&&req.method==='POST')&&!(action&&req.method==='POST'))return false;
 let c;
 try{
  const b=await input(req);let actor;
  if(action){const bearer=String(req.headers.authorization||'').replace(/^Bearer\s+/i,'');actor=(await pool.query("SELECT u.id,u.company_id,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now() AND u.status='active' AND NOT coalesce(u.must_change_password,false)",[sha(bearer)])).rows[0];if(!actor)return reply(res,401,{error:'Nicht angemeldet'});if(!['owner','admin'].includes(actor.role))return reply(res,403,{error:'Keine Berechtigung'});if(action[2]==='delete'&&b.confirmDelete!==true)return reply(res,400,{error:'Löschung muss bestätigt werden'});}
  else if(!/^[a-f0-9]{64}$/.test(String(b.token||''))||String(b.name||'').trim().length<2||String(b.name||'').trim().length>100||!validPassword(b.password)||!/^\d{4}$/.test(String(b.pin||''))||b.pin!==b.confirmPin)return reply(res,400,{error:'Name, sicheres Passwort und bestätigte Stempel-PIN mit genau 4 Ziffern erforderlich. Mindestens 6 Zeichen mit Groß-/Kleinbuchstaben, Zahl und Sonderzeichen.'});
  c=await pool.connect();await c.query('BEGIN');
  if(!action){
   const invitation=(await c.query("SELECT i.token_hash,u.id FROM staff_invitations i JOIN users u ON u.id=i.user_id JOIN employees e ON e.user_id=u.id WHERE i.token_hash=$1 AND i.used_at IS NULL AND i.expires_at>now() AND u.status='pending' AND u.role='waiter' AND e.active=true FOR UPDATE OF u,e,i",[sha(b.token)])).rows[0];
   if(!invitation){await c.query('ROLLBACK');return reply(res,400,{error:'Einladungslink ungültig oder abgelaufen'})}
   const name=b.name.trim();await c.query("UPDATE users SET display_name=$1,password_hash=$2,status='active',must_change_password=false WHERE id=$3",[name,pass(b.password),invitation.id]);await c.query('UPDATE employees SET display_name=$1,pin_hash=$3,stamp_pin_digits=4 WHERE user_id=$2',[name,invitation.id,pinHash(b.pin)]);await c.query('UPDATE staff_invitations SET used_at=now() WHERE user_id=$1 AND used_at IS NULL',[invitation.id]);await c.query('COMMIT');return reply(res,200,{message:'Zugang eingerichtet. Melde dich mit deiner E-Mail und deinem Passwort an. Die Stempel-PIN benötigst du nur an der Kasse.'});
  }
  const employee=(await c.query("SELECT e.id,e.user_id FROM employees e JOIN restaurants r ON r.id=e.restaurant_id JOIN users u ON u.id=e.user_id WHERE e.id=$1 AND e.role='waiter' AND u.role='waiter' AND r.company_id=$2 AND u.company_id=$2 FOR UPDATE OF u,e",[action[1],actor.company_id])).rows[0];
  if(!employee){await c.query('ROLLBACK');return reply(res,404,{error:'Kellner nicht gefunden'})}
  const id=employee.user_id;await c.query("UPDATE employees SET active=false,duty_state='off',pin_hash=NULL WHERE id=$1",[employee.id]);await c.query("UPDATE users SET status='disabled' WHERE id=$1",[id]);
  await c.query('DELETE FROM sessions WHERE user_id=$1',[id]);await c.query('DELETE FROM waiter_recovery WHERE user_id=$1',[id]);await c.query('DELETE FROM staff_invitations WHERE user_id=$1',[id]);await c.query('DELETE FROM password_reset_tokens WHERE user_id=$1',[id]);await c.query('DELETE FROM waiter_push_subscriptions WHERE user_id=$1',[id]);
  await c.query("DELETE FROM transactional_mail WHERE dedupe_key=$1 OR dedupe_key=$2",['staff:'+id,'employee:'+employee.id]);
  await c.query('UPDATE dining_tables SET waiter_employee_ids=array_remove(waiter_employee_ids,$1) WHERE $1=ANY(waiter_employee_ids)',[employee.id]);await c.query('UPDATE dining_tables SET waiter_employee_id=NULL WHERE waiter_employee_id=$1',[employee.id]);
  if(action[2]==='delete'){
   await c.query("UPDATE employees SET display_name='Gelöschter Mitarbeiter' WHERE id=$1",[employee.id]);
   await c.query("UPDATE users SET display_name='Gelöschter Mitarbeiter',email=$1,password_hash=$2,avatar_data=NULL,must_change_password=false WHERE id=$3",['deleted-'+id+'@invalid.example',pass(crypto.randomBytes(32).toString('hex')),id]);
  }
  await c.query("INSERT INTO audit_log(company_id,actor_user_id,event_type,entity_type,entity_id,payload) VALUES($1,$2,$3,'employee',$4,'{}')",[actor.company_id,actor.id,'staff.'+action[2],employee.id]);await c.query('COMMIT');return reply(res,200,{ok:true,deleted:action[2]==='delete'});
 }catch(e){if(c)await c.query('ROLLBACK');if(e.status)return reply(res,e.status,{error:e.message});throw e}finally{c?.release()}
}}
