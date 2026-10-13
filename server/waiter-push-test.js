import crypto from 'node:crypto';
import webpush from 'web-push';

// Short-lived diagnostic only. No orders, subscription keys or endpoints exposed.
export function createWaiterPushTest(pool, {schedule=(fn,ms)=>setTimeout(fn,ms).unref(),send=(sub,payload)=>webpush.sendNotification(sub,payload,{TTL:300,urgency:'high',timeout:15000}),env=process.env,now=Date.now}={}) {
  const tests=new Map();
  const clean=()=>{for(const [id,test]of tests)if(test.expires<now())tests.delete(id)};
  const view=t=>({state:t.state,delaySeconds:15});
  return {
    status(userId){clean();const test=[...tests.values()].reverse().find(t=>t.userId===userId);return test?view(test):{state:'none'}},
    receipt(key){clean();const t=tests.get(key);if(!t)return false;t.state='displayed';return true},
    async start(userId){
      clean();const pending=[...tests.values()].find(t=>t.userId===userId&&['queued','sending'].includes(t.state));if(pending)return view(pending);
      if(!env.VAPID_PUBLIC_KEY||!env.VAPID_PRIVATE_KEY)throw Error('Push-Schlüssel fehlen auf dem Server.');
      const {rows}=await pool.query('SELECT endpoint,subscription FROM waiter_push_subscriptions WHERE user_id=$1',[userId]);
      if(!rows.length)throw Error('Kein Handy für Hintergrundmeldungen registriert.');
      webpush.setVapidDetails(env.VAPID_SUBJECT||'mailto:info@bringness.de',env.VAPID_PUBLIC_KEY,env.VAPID_PRIVATE_KEY);
      const key=crypto.randomBytes(32).toString('hex'),test={userId,state:'queued',expires:now()+300000};tests.set(key,test);
      schedule(async()=>{
        test.state='sending';
        const payload=JSON.stringify({title:'Bringness · Standby-Test',body:'Diese Nachricht wurde bei gesperrtem Bildschirm gesendet.',orderId:'test-'+key,receiptUrl:'/api/v1/waiter/push/receipt/'+key,url:'/service/'});
        const results=await Promise.allSettled(rows.map(async row=>{try{await send(row.subscription,payload)}catch(e){if(e.statusCode===404||e.statusCode===410)await pool.query('DELETE FROM waiter_push_subscriptions WHERE endpoint=$1',[row.endpoint]);throw e}}));
        if(test.state!=='displayed')test.state=results.some(r=>r.status==='fulfilled')?'accepted':'failed';
      },15000);
      return view(test);
    }
  };
}
