import crypto from 'node:crypto';
export function mollieConnectConfiguration(env=process.env){
 const clientId=env.CENTER_MOLLIE_CLIENT_ID,redirectUri=env.CENTER_MOLLIE_REDIRECT_URI;
 if(!clientId?.startsWith('app_')||!redirectUri)return null;
 try{const uri=new URL(redirectUri);if(uri.protocol!=='https:'||uri.pathname!=='/api/v1/centers/mollie/callback'||uri.search||uri.hash)return null;}catch{return null;}
 return {clientId,redirectUri};
}
export async function beginRestaurantMollieConnect(pool,user,centerId,restaurantId,env=process.env){
 const config=mollieConnectConfiguration(env);if(!config)return {status:503,error:'Mollie Connect ist für Bringness noch nicht eingerichtet.'};
 const browserNonce=crypto.randomBytes(32).toString('hex'),browserHash=crypto.createHash('sha256').update(browserNonce).digest('hex');
 if(!env.CENTER_MOLLIE_CLIENT_SECRET)return {status:503,error:'Mollie Connect noch nicht vollständig eingerichtet'};
 try{encryptionKey(env);}catch{return {status:503,error:'Sichere Tokenspeicherung nicht eingerichtet'};}
 const state=crypto.randomBytes(32).toString('hex'),hash=crypto.createHash('sha256').update(state).digest('hex');
 const q=await pool.query(`INSERT INTO center_mollie_oauth_states(state_hash,user_id,center_id,restaurant_id,expires_at,browser_hash)
 SELECT $1,$2,c.id,r.id,now()+interval '10 minutes',$6 FROM centers c
 JOIN center_restaurants cr ON cr.center_id=c.id JOIN restaurants r ON r.id=cr.restaurant_id
 WHERE c.id=$3 AND r.id=$4 AND c.company_id=$5 AND r.company_id=$5 AND cr.active=true
 RETURNING state_hash`,[hash,user.id,centerId,restaurantId,user.company_id,browserHash]);
 if(!q.rows.length)return {status:404,error:'Restaurant nicht gefunden'};
 const url=new URL('https://my.mollie.com/oauth2/authorize');
 for(const [key,value] of Object.entries({client_id:config.clientId,redirect_uri:config.redirectUri,state,scope:'organizations.read profiles.read payments.read payments.write',response_type:'code',locale:'de_DE'}))url.searchParams.set(key,value);
 return {status:200,authorizationUrl:url.href,browserNonce};
}
function encryptionKey(env){if(!/^[a-f0-9]{64}$/i.test(env.CENTER_MOLLIE_TOKEN_KEY||''))throw Error('TOKEN_KEY_MISSING');return Buffer.from(env.CENTER_MOLLIE_TOKEN_KEY,'hex');}
export function encryptMerchantTokens(tokens,restaurantId,env=process.env){
 const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',encryptionKey(env),iv);
 cipher.setAAD(Buffer.from(restaurantId));const encrypted=Buffer.concat([cipher.update(JSON.stringify(tokens),'utf8'),cipher.final()]);
 return [iv,cipher.getAuthTag(),encrypted].map(b=>b.toString('base64')).join('.');
}
export function decryptMerchantTokens(value,restaurantId,env=process.env){
 const [iv,tag,data]=value.split('.').map(s=>Buffer.from(s,'base64'));const decipher=crypto.createDecipheriv('aes-256-gcm',encryptionKey(env),iv);
 decipher.setAAD(Buffer.from(restaurantId));decipher.setAuthTag(tag);return JSON.parse(Buffer.concat([decipher.update(data),decipher.final()]).toString('utf8'));
}
export async function completeRestaurantMollieConnect(pool,params,browserNonce,env=process.env,fetcher=fetch){
 const config=mollieConnectConfiguration(env);
 if(!config||!env.CENTER_MOLLIE_CLIENT_SECRET)return {status:503,error:'Mollie Connect nicht eingerichtet'};
 try{encryptionKey(env);}catch{return {status:503,error:'Sichere Tokenspeicherung nicht eingerichtet'};}
 if(!/^[a-f0-9]{64}$/.test(params.state||'')||!/^[a-f0-9]{64}$/.test(browserNonce||''))return {status:400,error:'Verbindung ungültig oder abgelaufen'};
 const stateHash=crypto.createHash('sha256').update(params.state).digest('hex'),browserHash=crypto.createHash('sha256').update(browserNonce).digest('hex');
 const state=(await pool.query(`DELETE FROM center_mollie_oauth_states s USING users u
 WHERE s.state_hash=$1 AND s.browser_hash=$2 AND s.expires_at>now() AND u.id=s.user_id
 AND u.status='active' AND u.role IN ('owner','admin') AND NOT coalesce(u.must_change_password,false)
 RETURNING s.center_id,s.restaurant_id,s.user_id`,[stateHash,browserHash])).rows[0];
 if(!state)return {status:400,error:'Verbindung ungültig oder bereits verwendet'};
 if(params.error)return {status:400,error:'Mollie-Verbindung wurde nicht freigegeben'};
 if(typeof params.code!=='string'||!params.code||params.code.length>2048)return {status:400,error:'Freigabecode fehlt'};
 try{
 const response=await fetcher('https://api.mollie.com/oauth2/tokens',{method:'POST',headers:{authorization:'Basic '+Buffer.from(config.clientId+':'+env.CENTER_MOLLIE_CLIENT_SECRET).toString('base64'),'content-type':'application/x-www-form-urlencoded',accept:'application/json'},body:new URLSearchParams({grant_type:'authorization_code',code:params.code,redirect_uri:config.redirectUri}),signal:AbortSignal.timeout(15000)});
 if(!response.ok)return {status:502,error:'Mollie-Verbindung fehlgeschlagen. Bitte erneut verbinden.'};
 const tokens=await response.json();
 if(typeof tokens.access_token!=='string'||!tokens.access_token||typeof tokens.refresh_token!=='string'||!tokens.refresh_token||!Number.isFinite(tokens.expires_in)||tokens.expires_in<=0)return {status:502,error:'Ungültige Mollie-Antwort'};
 const encrypted=encryptMerchantTokens({access_token:tokens.access_token,refresh_token:tokens.refresh_token},state.restaurant_id,env);
 const q=await pool.query(`WITH stored AS (INSERT INTO center_mollie_credentials(restaurant_id,token_envelope,expires_at)
 SELECT r.id,$3,now()+($4 * interval '1 second') FROM restaurants r JOIN users u ON u.id=$5
 JOIN center_restaurants cr ON cr.restaurant_id=r.id
 WHERE cr.center_id=$1 AND r.id=$2 AND cr.active=true AND r.company_id=u.company_id
 AND u.status='active' AND u.role IN ('owner','admin') AND NOT coalesce(u.must_change_password,false)
 ON CONFLICT(restaurant_id) DO UPDATE SET token_envelope=EXCLUDED.token_envelope,expires_at=EXCLUDED.expires_at,updated_at=now()
 RETURNING restaurant_id) UPDATE center_restaurants cr SET payment_status='pending',merchant_reference=NULL
 FROM stored WHERE cr.restaurant_id=stored.restaurant_id AND cr.center_id=$1 RETURNING cr.restaurant_id`,[state.center_id,state.restaurant_id,encrypted,tokens.expires_in,state.user_id]);
 if(!q.rows.length)return {status:403,error:'Restaurantfreigabe nicht mehr gültig'};
 return {status:200,connected:true,paymentsEnabled:false,message:'Konto verbunden. Händlerprofil und Zahlungsbereitschaft werden noch geprüft.'};
 }catch{return {status:502,error:'Mollie-Verbindung fehlgeschlagen. Bitte erneut verbinden.'};}
}
