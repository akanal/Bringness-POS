import {decryptMerchantTokens,encryptMerchantTokens,mollieConnectConfiguration} from './center-mollie-connect.js';
export async function withMerchantToken(pool,restaurantId,operation,env=process.env,fetcher=fetch){
 const client=await pool.connect();let inTransaction=false;
 try{
 await client.query('BEGIN');inTransaction=true;
 const row=(await client.query('SELECT * FROM center_mollie_credentials WHERE restaurant_id=$1 FOR UPDATE',[restaurantId])).rows[0];
 if(!row)throw Error('MERCHANT_NOT_CONNECTED');
 let envelope=row.token_envelope;let tokens=decryptMerchantTokens(row.token_envelope,restaurantId,env);
 if(Date.parse(row.expires_at)<=Date.now()+60000){
 const config=mollieConnectConfiguration(env);if(!config||!env.CENTER_MOLLIE_CLIENT_SECRET)throw Error('CONNECT_NOT_CONFIGURED');
 const r=await fetcher('https://api.mollie.com/oauth2/tokens',{method:'POST',headers:{authorization:'Basic '+Buffer.from(config.clientId+':'+env.CENTER_MOLLIE_CLIENT_SECRET).toString('base64'),'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:tokens.refresh_token}),signal:AbortSignal.timeout(15000)});
 if(!r.ok)throw Error('MERCHANT_RECONNECT_REQUIRED');
 const next=await r.json();if(typeof next.access_token!=='string'||!next.access_token||!Number.isFinite(next.expires_in)||next.expires_in<=0)throw Error('INVALID_TOKEN_RESPONSE');
 tokens={access_token:next.access_token,refresh_token:next.refresh_token||tokens.refresh_token};
 envelope=encryptMerchantTokens(tokens,restaurantId,env);
 await client.query("UPDATE center_mollie_credentials SET token_envelope=$2,expires_at=now()+($3 * interval '1 second'),updated_at=now() WHERE restaurant_id=$1",[restaurantId,envelope,next.expires_in]);
 }
 // Persist rotated refresh credentials before any downstream API request can fail.
 await client.query('COMMIT');inTransaction=false;
 return await operation(tokens.access_token,envelope);
 }catch(error){if(inTransaction)await client.query('ROLLBACK');throw error;}finally{client.release();}
}
export async function verifyMerchantProfile(pool,restaurantId,profileId,env=process.env,fetcher=fetch){
 if(!/^pfl_[a-zA-Z0-9]+$/.test(profileId||''))throw Error('INVALID_PROFILE');
 return withMerchantToken(pool,restaurantId,async (accessToken,envelope)=>{
 async function get(path){const r=await fetcher('https://api.mollie.com/v2'+path,{headers:{authorization:'Bearer '+accessToken,accept:'application/json'},signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('MERCHANT_CHECK_FAILED');return r.json();}
 const [organization,onboarding,profile]=await Promise.all([get('/organizations/me'),get('/onboarding/me'),get('/profiles/'+profileId)]);
 const ready=onboarding.canReceivePayments===true&&onboarding.canReceiveSettlements===true&&profile.status==='verified'&&profile.id===profileId&&/^org_[a-zA-Z0-9]+$/.test(organization.id||'');
 const q=await pool.query(`WITH checked AS (UPDATE center_mollie_credentials SET profile_id=$2,organization_id=$3,
 verified_at=CASE WHEN $4 THEN now() ELSE NULL END WHERE restaurant_id=$1 AND token_envelope=$5 RETURNING restaurant_id)
 UPDATE center_restaurants cr SET merchant_reference=CASE WHEN $4 THEN $3 ELSE NULL END,
 payment_status=CASE WHEN $4 THEN 'verified' ELSE 'pending' END FROM checked
 WHERE cr.restaurant_id=checked.restaurant_id RETURNING cr.restaurant_id`,[restaurantId,profileId,organization.id||null,ready,envelope]);
 if(!q.rows.length)throw Error('MERCHANT_CONNECTION_CHANGED');
 return {ready,profileId};
 },env,fetcher);
}
