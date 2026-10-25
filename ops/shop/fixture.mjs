import {dependency} from './dependency.mjs';
import crypto from 'node:crypto';
import {pathToFileURL} from 'node:url';
export async function fixture(){
 const location=dependency('@electric-sql/pglite','SHOP_PGLITE_PATH');
 const {PGlite}=await import(pathToFileURL(location));const db=new PGlite();await db.waitReady;
 await db.exec(`CREATE TABLE companies(id uuid PRIMARY KEY);CREATE TABLE users(id uuid PRIMARY KEY,company_id uuid,role text,status text,must_change_password boolean DEFAULT false);CREATE TABLE sessions(user_id uuid,token_hash text,expires_at timestamptz);CREATE TABLE billing_plans(id uuid PRIMARY KEY,code text UNIQUE,active boolean,billing_type text,amount_cents int,currency text);CREATE TABLE company_billing_terms(company_id uuid,plan_code text,monthly_net_cents int);CREATE TABLE company_entitlements(company_id uuid,plan_id uuid,status text,current_period_end timestamptz);CREATE TABLE company_features(company_id uuid,feature_code text,status text,payment_status text,ends_at timestamptz,grace_until timestamptz);CREATE TABLE company_billing_profiles(company_id uuid,company_name text,street text,postal_code text,city text,country text);CREATE TABLE billing_transactions(company_id uuid,plan_id uuid,status text,paid_at timestamptz);CREATE TABLE billing_checkout_guards(id uuid PRIMARY KEY,company_id uuid,plan_id uuid,slot text,status text,provider_payment_id text);`);
 const a=crypto.randomUUID(),b=crypto.randomUUID(),online=crypto.randomUUID(),download=crypto.randomUUID();
 for(const id of[a,b]){await db.query('INSERT INTO companies VALUES($1)',[id]);await db.query("INSERT INTO company_billing_profiles VALUES($1,'Fixture Company','Example 1','10115','Berlin','DE')",[id]);}
 for(const [token,company,role,status,reset,expired]of[['owner-a',a,'owner','active',false,false],['owner-b',b,'owner','active',false,false],['waiter',a,'waiter','active',false,false],['inactive',a,'owner','inactive',false,false],['reset',a,'owner','active',true,false],['expired',a,'owner','active',false,true]]){const id=crypto.randomUUID();await db.query('INSERT INTO users VALUES($1,$2,$3,$4,$5)',[id,company,role,status,reset]);await db.query("INSERT INTO sessions VALUES($1,$2,clock_timestamp()+($3::text)::interval)",[id,crypto.createHash('sha256').update(token).digest('hex'),expired?'-1 hour':'1 hour']);}
 await db.exec("ALTER TABLE users ADD COLUMN email text DEFAULT 'fixture@example.test';ALTER TABLE users ADD COLUMN display_name text DEFAULT 'Fixture Owner';");
 await db.query("INSERT INTO billing_plans VALUES($1,'pos_base_monthly',true,'monthly',3499,'EUR'),($2,'download_license',true,'one_time',39900,'EUR')",[online,download]);await db.query("INSERT INTO company_billing_terms VALUES($1,'pos_base_monthly',2999)",[a]);
 const query=async(s,p)=>{const r=await db.query(s,p);return {...r,rowCount:r.affectedRows??r.rows.length};};
 const pool={query,connect:async()=>({query,release(){}})};
 return {db,pool,a,b,online,download};
}
