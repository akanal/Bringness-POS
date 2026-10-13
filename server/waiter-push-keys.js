import webpush from 'web-push';

// Keep the same application identity across deployments and overlapping starts.
// Existing operator-configured keys always take precedence; never log private keys.
export async function ensureWaiterPushKeys(pool, env=process.env) {
  if(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY) {
    try {
      webpush.setVapidDetails(env.VAPID_SUBJECT || 'mailto:info@bringness.de',env.VAPID_PUBLIC_KEY,env.VAPID_PRIVATE_KEY);
      return;
    } catch { console.warn('Configured waiter push identity invalid; using persisted identity.'); }
  }
  await pool.query('CREATE TABLE IF NOT EXISTS waiter_push_identity(id boolean PRIMARY KEY CHECK(id=true),public_key text NOT NULL,private_key text NOT NULL)');
  const keys=webpush.generateVAPIDKeys();
  await pool.query('INSERT INTO waiter_push_identity(id,public_key,private_key) VALUES(true,$1,$2) ON CONFLICT(id) DO NOTHING',[keys.publicKey,keys.privateKey]);
  const {rows}=await pool.query('SELECT public_key,private_key FROM waiter_push_identity WHERE id=true');
  env.VAPID_PUBLIC_KEY=rows[0].public_key;
  env.VAPID_PRIVATE_KEY=rows[0].private_key;
  webpush.setVapidDetails('mailto:info@bringness.de',env.VAPID_PUBLIC_KEY,env.VAPID_PRIVATE_KEY);
  env.VAPID_SUBJECT='mailto:info@bringness.de';
}
