import crypto from 'node:crypto';
import pg from 'pg';

const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.NODE_ENV==='production'?{rejectUnauthorized:false}:false});
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const pass=x=>crypto.scryptSync(x,process.env.PASSWORD_PEPPER||'bringness-pos',64).toString('hex');
const reply=(res,status,value)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(value));return true};
async function input(req){let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>8192)throw Error('Anfrage zu groß')}return raw?JSON.parse(raw):{}}
const configured=()=>Boolean(process.env.SMTP_HOST&&process.env.SMTP_USER&&process.env.SMTP_PASSWORD&&process.env.SMTP_FROM);

export async function migrateStaffInvitations(){await pool.query(`CREATE TABLE IF NOT EXISTS staff_invitations(token_hash text PRIMARY KEY,user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,expires_at timestamptz NOT NULL,used_at timestamptz,created_at timestamptz NOT NULL DEFAULT now()); CREATE INDEX IF NOT EXISTS staff_invitations_user_idx ON staff_invitations(user_id);`)}

export async function handleStaffInvitations(req,res){
  const pathname=new URL(req.url,'http://localhost').pathname;
  if(pathname==='/api/v1/staff/confirm'&&req.method==='POST'){
    const {token}=await input(req);
    if(!/^[a-f0-9]{64}$/.test(String(token||'')))return reply(res,400,{error:'Ungültiger Aktivierungslink'});
    const q=await pool.query("WITH valid AS (UPDATE staff_invitations SET used_at=now() WHERE token_hash=$1 AND used_at IS NULL AND expires_at>now() RETURNING user_id) UPDATE users SET status='active' WHERE id=(SELECT user_id FROM valid) AND status='pending' RETURNING id",[sha(token)]);
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
  const pin=String(crypto.randomInt(0,1000000)).padStart(6,'0'),token=crypto.randomBytes(32).toString('hex');
  const origin=(process.env.PUBLIC_BASE_URL||'https://bringness.de').replace(/\/$/,'');
  if(!origin.startsWith('https://'))return reply(res,503,{error:'Öffentliche HTTPS-Adresse fehlt'});
  const port=Number(process.env.SMTP_PORT||587);if(!Number.isInteger(port)||port<1||port>65535)return reply(res,503,{error:'SMTP-Port ungültig'});
  const c=await pool.connect();
  try{
    await c.query('BEGIN');
    const r=await c.query("SELECT name FROM restaurants WHERE id=$1 AND company_id=$2 AND mode='restaurant'",[restaurantId,actor.company_id]);
    if(!r.rowCount){await c.query('ROLLBACK');return reply(res,404,{error:'Restaurant nicht gefunden'})}
    const user=(await c.query("INSERT INTO users(company_id,email,password_hash,display_name,status,role,must_change_password) VALUES($1,$2,$3,$4,'pending','waiter',true) RETURNING id",[actor.company_id,email,pass(pin),name])).rows[0];
    const employee=(await c.query("INSERT INTO employees(restaurant_id,display_name,role,active,user_id) VALUES($1,$2,'waiter',true,$3) RETURNING id,display_name,active",[restaurantId,name,user.id])).rows[0];
    await c.query("INSERT INTO staff_invitations(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '48 hours')",[sha(token),user.id]);
    const {default:nodemailer}=await import('nodemailer');
    const transport=nodemailer.createTransport({host:process.env.SMTP_HOST,port,secure:port===465,requireTLS:port!==465,auth:{user:process.env.SMTP_USER,pass:process.env.SMTP_PASSWORD},tls:{rejectUnauthorized:true}});
    await transport.sendMail({from:process.env.SMTP_FROM,to:email,subject:'Bringness – Kellnerzugang bestätigen',text:`Hallo ${name},\n\n${r.rows[0].name} hat dich zum Bringness-Service eingeladen. Bestätige deine E-Mail innerhalb von 48 Stunden:\n${origin}/service/#activate=${token}\n\nDein sechsstelliger Erstcode: ${pin}\nNach der Bestätigung melde dich mit dieser E-Mail und dem Erstcode an. Danach legst du einen eigenen sechsstelligen Code fest.\n\nFalls du keine Einladung erwartet hast, ignoriere diese E-Mail.`});
    await c.query('COMMIT');
    return reply(res,201,{waiter:{...employee,email,status:'pending'},message:'Einladung und Erstcode wurden per E-Mail versendet. Der Zugang wird nach Bestätigung freigeschaltet.'});
  }catch(error){await c.query('ROLLBACK');if(error.code==='23505')return reply(res,409,{error:'E-Mail ist bereits vergeben'});console.error('Staff invitation failed:',error.message);return reply(res,503,{error:'Einladung konnte nicht versendet werden. Konto wurde nicht angelegt.'})}finally{c.release()}
}

