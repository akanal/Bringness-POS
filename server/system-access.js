import crypto from 'node:crypto';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function send(res,status,data){res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(data));return null}
export async function systemActor(pool,req,res,restaurantId){
  const token=String(req.headers.authorization||'').replace(/^Bearer\s+/i,'');
  if(!token)return send(res,401,{error:'Bitte als Superadmin anmelden'});
  const actor=(await pool.query(`SELECT u.id,s.token_hash session_hash FROM sessions s JOIN users u ON u.id=s.user_id
    JOIN platform_admins pa ON pa.user_id=u.id AND pa.active=true
    WHERE s.token_hash=$1 AND s.expires_at>now() AND u.status='active' AND NOT coalesce(u.must_change_password,false)`,
    [crypto.createHash('sha256').update(token).digest('hex')])).rows[0];
  if(!actor)return send(res,403,{error:'Nur freigeschaltete Superadmins dürfen diese Systeme steuern'});
  if(restaurantId===undefined)return actor;
  if(!uuid.test(String(restaurantId)))return send(res,400,{error:'Bitte einen Betrieb auswählen'});
  const restaurant=(await pool.query('SELECT id,company_id FROM restaurants WHERE id=$1',[restaurantId])).rows[0];
  if(!restaurant)return send(res,404,{error:'Betrieb nicht gefunden'});
  return {...actor,company_id:restaurant.company_id,role:'owner',systemAdmin:true};
}
export function createSystemDirectory(pool){return async(req,res)=>{
  if(new URL(req.url,'http://local').pathname!=='/api/v1/platform/systems')return false;
  if(!await systemActor(pool,req,res))return true;
  if(req.method!=='GET'){send(res,405,{error:'Methode nicht erlaubt'});return true}
  const restaurants=(await pool.query(`SELECT r.id,r.name,r.company_id,c.name company_name FROM restaurants r JOIN companies c ON c.id=r.company_id ORDER BY c.name,r.name,r.id LIMIT 1000`)).rows;
  send(res,200,{restaurants,limited:restaurants.length===1000});return true;
}}
