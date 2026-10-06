import crypto from 'node:crypto';
export function mollieConnectConfiguration(env=process.env){
 const clientId=env.CENTER_MOLLIE_CLIENT_ID,redirectUri=env.CENTER_MOLLIE_REDIRECT_URI;
 if(!clientId?.startsWith('app_')||!redirectUri)return null;
 try{if(new URL(redirectUri).protocol!=='https:')return null;}catch{return null;}
 return {clientId,redirectUri};
}
export async function beginRestaurantMollieConnect(pool,user,centerId,restaurantId,env=process.env){
 const config=mollieConnectConfiguration(env);if(!config)return {status:503,error:'Mollie Connect ist für Bringness noch nicht eingerichtet.'};
 const state=crypto.randomBytes(32).toString('hex'),hash=crypto.createHash('sha256').update(state).digest('hex');
 const q=await pool.query(`INSERT INTO center_mollie_oauth_states(state_hash,user_id,center_id,restaurant_id,expires_at)
 SELECT $1,$2,c.id,r.id,now()+interval '10 minutes' FROM centers c
 JOIN center_restaurants cr ON cr.center_id=c.id JOIN restaurants r ON r.id=cr.restaurant_id
 WHERE c.id=$3 AND r.id=$4 AND c.company_id=$5 AND r.company_id=$5 AND cr.active=true
 RETURNING state_hash`,[hash,user.id,centerId,restaurantId,user.company_id]);
 if(!q.rows.length)return {status:404,error:'Restaurant nicht gefunden'};
 const url=new URL('https://my.mollie.com/oauth2/authorize');
 for(const [key,value] of Object.entries({client_id:config.clientId,redirect_uri:config.redirectUri,state,scope:'organizations.read profiles.read payments.read payments.write',response_type:'code',locale:'de_DE'}))url.searchParams.set(key,value);
 return {status:200,authorizationUrl:url.href};
}
