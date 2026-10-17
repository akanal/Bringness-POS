import crypto from 'node:crypto';
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export async function issueLoginSession(db,{kind='pos',userId,passwordHash,role}={}){
 if(!['pos','ai'].includes(kind)||typeof userId!=='string'||!uuid.test(userId))return null;
 const table=kind==='pos'?'users':'ai_accounts',sessions=kind==='pos'?'sessions':'ai_sessions',foreignKey=kind==='pos'?'user_id':'account_id',lifetime=kind==='pos'?'30 days':'12 hours';
 const c=await db.connect();try{
  await c.query('BEGIN');
  // Password changes and suspension take conflicting row locks. Whichever
  // transaction wins, an old credential cannot create a surviving new session.
  const account=(await c.query('SELECT id,status,password_hash,role FROM '+table+' WHERE id=$1 FOR SHARE',[userId])).rows[0];
  if(!account||account.status!=='active'||passwordHash!==undefined&&account.password_hash!==passwordHash||role!==undefined&&account.role!==role){await c.query('ROLLBACK');return null;}
  const token=crypto.randomBytes(32).toString('hex'),digest=crypto.createHash('sha256').update(token).digest('hex');
  await c.query('INSERT INTO '+sessions+'(token_hash,'+foreignKey+',expires_at) VALUES($1,$2,now()+interval \''+lifetime+'\')',[digest,userId]);
  await c.query('COMMIT');return token;
 }catch(error){await c.query('ROLLBACK');throw error;}finally{c.release();}
}
