import {createStaffInvitation,handleStaffActivation} from './staff-self-activation.js';
import crypto from 'node:crypto';
import pg from 'pg';

const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.NODE_ENV==='production'?{rejectUnauthorized:false}:false});
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const reply=(res,status,value)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(value));return true};
async function input(req){let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>8192)throw Error('Anfrage zu groß')}return raw?JSON.parse(raw):{}}
const configured=()=>Boolean(process.env.SMTP_HOST&&process.env.SMTP_USER&&process.env.SMTP_PASSWORD&&process.env.SMTP_FROM);

export async function migrateStaffInvitations(){await pool.query(`CREATE TABLE IF NOT EXISTS staff_invitations(token_hash text PRIMARY KEY,user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,expires_at timestamptz NOT NULL,used_at timestamptz,created_at timestamptz NOT NULL DEFAULT now()); ALTER TABLE staff_invitations ADD COLUMN IF NOT EXISTS self_setup boolean NOT NULL DEFAULT false; CREATE INDEX IF NOT EXISTS staff_invitations_user_idx ON staff_invitations(user_id);`)}

export async function handleStaffInvitations(req,res){
  if(await handleStaffActivation(pool,req,res))return true;
  const pathname=new URL(req.url,'http://localhost').pathname;
  if(pathname==='/api/v1/staff/confirm'&&req.method==='POST'){
    const {token}=await input(req);
    if(!/^[a-f0-9]{64}$/.test(String(token||'')))return reply(res,400,{error:'Ungültiger Aktivierungslink'});
    const q=await pool.query("WITH valid AS (UPDATE staff_invitations SET used_at=now() WHERE token_hash=$1 AND used_at IS NULL AND expires_at>now() AND self_setup=false RETURNING user_id) UPDATE users SET status='active' WHERE id=(SELECT user_id FROM valid) AND status='pending' RETURNING id",[sha(token)]);
    q.rowCount?reply(res,200,{message:'E-Mail bestätigt. Du kannst dich jetzt mit dem Erstcode anmelden.'}):reply(res,400,{error:'Aktivierungslink ungültig oder abgelaufen'});return true;
  }
  if(pathname!=='/api/v1/waiters'||req.method!=='POST')return false;
  const bearer=String(req.headers.authorization||'').replace(/^Bearer\s+/i,'');
  const auth=await pool.query("SELECT u.company_id,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now() AND u.status='active'",[sha(bearer)]);
  const actor=auth.rows[0];if(!actor)return reply(res,401,{error:'Nicht angemeldet'});
  if(!['owner','admin'].includes(actor.role))return reply(res,403,{error:'Keine Berechtigung'});
  if(!configured())return reply(res,503,{error:'Einladungs-E-Mail ist noch nicht eingerichtet. Bitte SMTP für diesen Dienst konfigurieren.'});
  const b=await input(req),name=String(b.name||'').trim(),email=String(b.email||'').trim().toLowerCase(),restaurantId=String(b.restaurantId||'');
  if(name.length<2||name.length>100||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!/^[a-f0-9-]{36}$/i.test(restaurantId))return reply(res,400,{error:'Name, Betrieb und gültige E-Mail erforderlich'});
  const origin=(process.env.PUBLIC_BASE_URL||'https://bringness.de').replace(/\/$/,'');
  if(!origin.startsWith('https://'))return reply(res,503,{error:'Öffentliche HTTPS-Adresse fehlt'});
  const port=Number(process.env.SMTP_PORT||587);if(!Number.isInteger(port)||port<1||port>65535)return reply(res,503,{error:'SMTP-Port ungültig'});
  const c=await pool.connect();
  try{
    await c.query('BEGIN');
    const r=await c.query("SELECT name FROM restaurants WHERE id=$1 AND company_id=$2 AND mode='restaurant'",[restaurantId,actor.company_id]);
    if(!r.rowCount){await c.query('ROLLBACK');return reply(res,404,{error:'Restaurant nicht gefunden'})}
    const {employee}=await createStaffInvitation(c,{companyId:actor.company_id,restaurantId,name,email,role:'waiter',restaurantName:r.rows[0].name});
    await c.query('COMMIT');
    return reply(res,201,{waiter:{...employee,email,status:'pending'},message:'Einladung gespeichert. Der Mitarbeiter legt seinen Zugang über den E-Mail-Link selbst fest.'});
  }catch(error){await c.query('ROLLBACK');if(error.code==='23505')return reply(res,409,{error:'E-Mail ist bereits vergeben'});console.error('Staff invitation failed:',error.message);return reply(res,503,{error:'Einladung konnte nicht versendet werden. Konto wurde nicht angelegt.'})}finally{c.release()}
}

