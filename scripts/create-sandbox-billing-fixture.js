// Run manually against the isolated Railway Sandbox database only.
// Required: DATABASE_URL, SANDBOX_FIXTURE=YES, RAILWAY_PROJECT_ID matching the sandbox.
// This script creates a dedicated owner and billing profile; it never contacts Mollie.
import crypto from 'node:crypto';
import pg from 'pg';
const sandboxId='7b5d969a-6459-40cb-b542-8ec2f1363172';
if(process.env.SANDBOX_FIXTURE!=='YES'||process.env.RAILWAY_PROJECT_ID!==sandboxId||!process.env.DATABASE_URL){
 console.error('Refusing fixture creation outside explicitly approved isolated sandbox');
 process.exit(1);
}
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.NODE_ENV==='production'?{rejectUnauthorized:false}:false});
const client=await pool.connect();
try{
 await client.query('BEGIN');
 const email='sandbox-billing-fixture@invalid.example';
 const found=await client.query('SELECT id FROM users WHERE email=$1',[email]);
 if(found.rowCount)throw Error('Sandbox fixture already exists; refusing to modify it');
 const company=(await client.query("INSERT INTO companies(name) VALUES($1) RETURNING id",['Bringness Sandbox Billing Fixture'])).rows[0];
 const password=crypto.randomBytes(24).toString('base64url');
 const passwordHash=crypto.scryptSync(password,process.env.PASSWORD_PEPPER||'bringness-pos',64).toString('hex');
 const user=(await client.query("INSERT INTO users(company_id,email,password_hash,display_name,status,role) VALUES($1,$2,$3,$4,'active','owner') RETURNING id",[company.id,email,passwordHash,'Sandbox Owner'])).rows[0];
 await client.query("INSERT INTO company_billing_profiles(company_id,company_name,contact_name,street,postal_code,city,country) VALUES($1,$2,$3,$4,$5,$6,$7)",[company.id,'Bringness Sandbox Billing Fixture','Sandbox Owner','Teststraße 1','10115','Berlin','Deutschland']);
 const token=crypto.randomBytes(32).toString('base64url');
 const tokenHash=crypto.createHash('sha256').update(token).digest('hex');
 await client.query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '2 hours')",[tokenHash,user.id]);
 await client.query('COMMIT');
 console.log(JSON.stringify({companyId:company.id,email,temporaryPassword:password,bearerToken:token,expiresInHours:2}));
}catch(error){await client.query('ROLLBACK').catch(()=>{});console.error('Sandbox fixture failed:',error.message);process.exitCode=1;
}finally{client.release();await pool.end()}
