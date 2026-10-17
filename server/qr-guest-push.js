import {readJsonObject} from './http-body.js';
import crypto from 'node:crypto';
import webpush from 'web-push';
import {validateGuestSubscription} from './center-guest-push.js';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const reply=(res,status,data,type='application/json')=>{res.writeHead(status,{'content-type':type,'cache-control':'no-store'});res.end(JSON.stringify(data));return true};
export async function migrateQrGuestPush(pool){await pool.query(`CREATE TABLE IF NOT EXISTS qr_guest_push(
order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,endpoint_hash text NOT NULL,subscription jsonb NOT NULL,
state text NOT NULL DEFAULT 'pending',attempts int NOT NULL DEFAULT 0,claimed_at timestamptz,sent_at timestamptz,
created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(order_id,endpoint_hash));`)}
export function createQrGuestPush(pool,{env=process.env,sender=(sub,payload)=>webpush.sendNotification(sub,payload,{TTL:300,urgency:'high',timeout:15000})}={}){
  let busy=false;
  async function order(id,key){if(!uuid.test(id||'')||!uuid.test(key||''))return null;return (await pool.query("SELECT o.id,o.guest_request_id,t.qr_token FROM orders o JOIN dining_tables t ON t.id=o.table_id WHERE o.id=$1 AND o.guest_request_id=$2 AND o.source='qr' AND o.qr_service_mode='pickup' AND o.status<>'cancelled' AND o.created_at>now()-interval '24 hours'",[id,key])).rows[0]||null}
  const returnUrl=o=>'/tisch/?collection='+encodeURIComponent(o.qr_token)+'&orderId='+o.id+'&requestId='+o.guest_request_id;
  return {
    async handle(req,res){
      const url=new URL(req.url,'http://local'),p=url.pathname;
      if(p!=='/api/v1/guest/collection-push')return false;
      if(!['GET','POST'].includes(req.method))return reply(res,405,{error:'Methode nicht erlaubt'});
      let b={};if(req.method==='POST'){try{b=await readJsonObject(req,{maxBytes:8192});}catch(error){return reply(res,error.status===413?413:400,{error:'Ungültige oder zu große Eingabe'});}}
      const o=await order(b.orderId||url.searchParams.get('orderId'),b.requestId||url.searchParams.get('requestId'));if(!o)return reply(res,404,{error:'Abholbestellung nicht gefunden oder abgelaufen'});
      if(req.method==='GET')return reply(res,200,{publicKey:env.VAPID_PUBLIC_KEY&&env.VAPID_PRIVATE_KEY?env.VAPID_PUBLIC_KEY:null});
      let sub;try{sub=validateGuestSubscription(b.subscription)}catch{return reply(res,400,{error:'Ungültiges Push-Abonnement'})}
      const hash=crypto.createHash('sha256').update(sub.endpoint).digest('hex');
      if(b.action==='disable'){await pool.query('DELETE FROM qr_guest_push WHERE order_id=$1 AND endpoint_hash=$2',[o.id,hash]);return reply(res,200,{subscribed:false})}
      if(b.action==='status'){const q=await pool.query('SELECT 1 FROM qr_guest_push WHERE order_id=$1 AND endpoint_hash=$2',[o.id,hash]);return reply(res,200,{subscribed:!!q.rows.length})}
      if(b.consent!==true)return reply(res,400,{error:'Bitte Mitteilungen für diese Bestellung ausdrücklich erlauben'});
      if(!env.VAPID_PUBLIC_KEY||!env.VAPID_PRIVATE_KEY)return reply(res,503,{error:'Hintergrundmeldungen sind auf dem Server nicht bereit'});
      const count=(await pool.query('SELECT count(*)::int n FROM qr_guest_push WHERE order_id=$1 AND endpoint_hash<>$2',[o.id,hash])).rows[0].n;if(count>=5)return reply(res,429,{error:'Zu viele Geräte für diese Bestellung'});
      await pool.query("INSERT INTO qr_guest_push(order_id,endpoint_hash,subscription) VALUES($1,$2,$3) ON CONFLICT(order_id,endpoint_hash) DO UPDATE SET subscription=EXCLUDED.subscription,state=CASE WHEN qr_guest_push.state='failed' THEN 'pending' ELSE qr_guest_push.state END,attempts=CASE WHEN qr_guest_push.state='failed' THEN 0 ELSE qr_guest_push.attempts END",[o.id,hash,JSON.stringify(sub)]);
      return reply(res,200,{subscribed:true});
    },
    async tick(){
      if(busy)return 0;busy=true;
      try{
        await pool.query("DELETE FROM qr_guest_push s USING orders o WHERE o.id=s.order_id AND (o.status='cancelled' OR o.created_at<=now()-interval '24 hours')");
        if(!env.VAPID_PUBLIC_KEY||!env.VAPID_PRIVATE_KEY)return 0;
        webpush.setVapidDetails(env.VAPID_SUBJECT||'mailto:info@bringness.de',env.VAPID_PUBLIC_KEY,env.VAPID_PRIVATE_KEY);
        const jobs=(await pool.query(`WITH candidates AS (
          SELECT s.order_id,s.endpoint_hash FROM qr_guest_push s JOIN orders o ON o.id=s.order_id
          WHERE o.source='qr' AND o.qr_service_mode='pickup' AND o.qr_ready_at IS NOT NULL AND o.status<>'cancelled'
          AND s.attempts<5 AND (s.state='pending' OR (s.state='sending' AND s.claimed_at<now()-interval '2 minutes'))
          ORDER BY s.created_at LIMIT 10 FOR UPDATE OF s SKIP LOCKED
        ), claimed AS (UPDATE qr_guest_push s SET state='sending',attempts=attempts+1,claimed_at=now()
          FROM candidates c WHERE s.order_id=c.order_id AND s.endpoint_hash=c.endpoint_hash RETURNING s.*)
        SELECT s.*,o.guest_request_id,t.qr_token,r.name restaurant_name FROM claimed s JOIN orders o ON o.id=s.order_id
        JOIN dining_tables t ON t.id=o.table_id JOIN restaurants r ON r.id=o.restaurant_id`)).rows;
        for(const job of jobs){try{
          if(!(await pool.query('SELECT 1 FROM qr_guest_push WHERE order_id=$1 AND endpoint_hash=$2',[job.order_id,job.endpoint_hash])).rows.length)continue;
          await sender(validateGuestSubscription(job.subscription),JSON.stringify({title:job.restaurant_name+' · Abholbereit',body:'Ihre Bestellung '+job.order_id.slice(0,8).toUpperCase()+' ist fertig. Bitte am Tresen abholen.',tag:'qr-pickup-'+job.order_id,url:returnUrl({...job,id:job.order_id})}));
          await pool.query("UPDATE qr_guest_push SET state='sent',sent_at=now() WHERE order_id=$1 AND endpoint_hash=$2 AND state='sending'",[job.order_id,job.endpoint_hash]);
        }catch(error){if([404,410].includes(error.statusCode))await pool.query('DELETE FROM qr_guest_push WHERE order_id=$1 AND endpoint_hash=$2',[job.order_id,job.endpoint_hash]);else await pool.query("UPDATE qr_guest_push SET state=CASE WHEN attempts>=5 THEN 'failed' ELSE 'pending' END WHERE order_id=$1 AND endpoint_hash=$2",[job.order_id,job.endpoint_hash])}}
        return jobs.length;
      }finally{busy=false}
    }
  };
}
