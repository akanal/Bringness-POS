import crypto from 'node:crypto';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export async function inviteCenterRestaurant(pool,user,centerId,restaurantId){
 if(!['owner','admin'].includes(user.role)||!uuid.test(centerId||'')||!uuid.test(restaurantId||''))throw Error('INVITATION_NOT_ALLOWED');
 const token=crypto.randomBytes(32).toString('hex'),hash=crypto.createHash('sha256').update(token).digest('hex');
 const q=await pool.query(`INSERT INTO center_restaurant_invitations(token_hash,center_id,restaurant_id,created_by,expires_at)
 SELECT $1,c.id,r.id,$4,now()+interval '7 days' FROM centers c CROSS JOIN restaurants r
 WHERE c.id=$2 AND r.id=$3 AND c.company_id=$5 AND c.active=true RETURNING center_id`,[hash,centerId,restaurantId,user.id,user.company_id]);
 if(!q.rows.length)throw Error('INVITATION_NOT_ALLOWED');
 return {invitationUrl:'/center/join.html#token='+token};
}
export async function acceptCenterInvitation(pool,user,token){
 if(!['owner','admin'].includes(user.role)||!/^[a-f0-9]{64}$/.test(token||''))throw Error('INVITATION_NOT_ALLOWED');
 const client=await pool.connect();
 try{
  await client.query('BEGIN');
  const invitation=(await client.query(`SELECT i.* FROM center_restaurant_invitations i JOIN centers c ON c.id=i.center_id
 WHERE i.token_hash=$1 AND i.accepted_at IS NULL AND i.expires_at>now() AND c.active=true FOR UPDATE OF i`,[crypto.createHash('sha256').update(token).digest('hex')])).rows[0];
  if(!invitation)throw Error('INVITATION_NOT_ALLOWED');
  const restaurant=(await client.query('SELECT id FROM restaurants WHERE id=$1 AND company_id=$2 FOR UPDATE',[invitation.restaurant_id,user.company_id])).rows[0];
  if(!restaurant)throw Error('INVITATION_NOT_ALLOWED');
  await client.query(`INSERT INTO center_restaurants(center_id,restaurant_id,active) VALUES($1,$2,true)
 ON CONFLICT(center_id,restaurant_id) DO UPDATE SET active=true`,[invitation.center_id,restaurant.id]);
  await client.query('UPDATE center_restaurant_invitations SET accepted_at=now(),accepted_by=$2 WHERE token_hash=$1',[invitation.token_hash,user.id]);
  await client.query('COMMIT');return {joined:true,centerId:invitation.center_id,restaurantId:restaurant.id};
 }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}
