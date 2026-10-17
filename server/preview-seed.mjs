import crypto from 'node:crypto';
import pg from 'pg';
import {validatePreviewEnvironment} from './preview-policy.js';
import {passwordHash} from './ai-policy.js';
validatePreviewEnvironment();
const env=process.env,pos=new pg.Pool({connectionString:env.DATABASE_URL});
const aiUrl=new URL(env.DATABASE_URL);aiUrl.pathname='/'+env.AI_DATABASE_NAME;aiUrl.username='bringness_ai_app';aiUrl.password=env.AI_DB_PASSWORD;
const ai=new pg.Pool({connectionString:aiUrl.toString()}),uuid=()=>crypto.randomUUID();
async function ready(db,tables){for(let attempt=0;attempt<60;attempt++){try{const r=await db.query('SELECT '+tables.map((t,i)=>'to_regclass($'+(i+1)+') IS NOT NULL').join(' AND ')+' AS ready',tables);if(r.rows[0].ready)return;}catch{}await new Promise(resolve=>setTimeout(resolve,500));}throw Error('Preview schemas are not ready');}
try{
 await ready(pos,['companies','users','company_features','platform_admins','pos_checkout_requests','pos_table_settlements']);await ready(ai,['ai_accounts','ai_stock','ai_auto_procurement']);
 await pos.query('CREATE TABLE IF NOT EXISTS preview_seed_state(key text PRIMARY KEY,value jsonb NOT NULL)');
 const c=await pos.connect();let ids;
 try{
  await c.query('BEGIN');await c.query("SELECT pg_advisory_xact_lock(hashtext('isolated-preview-seed'))");
  const old=(await c.query("SELECT value FROM preview_seed_state WHERE key='fixture-v1'")).rows[0];
  if(old){ids=old.value;}else{
   if(Number((await c.query('SELECT count(*) n FROM companies')).rows[0].n)!==0)throw Error('Refusing to seed a nonempty unmarked database');
   ids=Object.fromEntries(['company','owner','restaurant','category','coffee','meal','table','aiAccount','aiLocation','aiStock'].map(key=>[key,uuid()]));
   await c.query("INSERT INTO companies(id,name) VALUES($1,'Bringness — synthetische Vorschau')",[ids.company]);
   await c.query("INSERT INTO users(id,company_id,email,password_hash,display_name,role,status) VALUES($1,$2,'preview@example.test',$3,'Vorschau Inhaber','owner','active')",[ids.owner,ids.company,crypto.scryptSync(env.PREVIEW_OWNER_PASSWORD,env.PASSWORD_PEPPER,64).toString('hex')]);
   await c.query("INSERT INTO platform_admins(user_id,active) VALUES($1,true)",[ids.owner]);
   await c.query("INSERT INTO restaurants(id,company_id,name,mode) VALUES($1,$2,'Vorschau Restaurant','restaurant')",[ids.restaurant,ids.company]);
   await c.query("INSERT INTO categories(id,restaurant_id,name) VALUES($1,$2,'Vorschau Speisekarte')",[ids.category,ids.restaurant]);
   await c.query("INSERT INTO products(id,restaurant_id,category_id,name,price_cents,tax_rate) VALUES($1,$3,$4,'Vorschau Kaffee',250,19),($2,$3,$4,'Vorschau Gericht',1250,19)",[ids.coffee,ids.meal,ids.restaurant,ids.category]);
   await c.query("INSERT INTO dining_tables(id,restaurant_id,name,status) VALUES($1,$2,'Vorschau Tisch 1','free')",[ids.table,ids.restaurant]);
   for(const feature of ['pos_base','restaurant','table_qr'])await c.query("INSERT INTO company_features(company_id,feature_code,status,ends_at) VALUES($1,$2,'active',now()+interval '30 days')",[ids.company,feature]);
   await c.query("INSERT INTO preview_seed_state VALUES('fixture-v1',$1::jsonb)",[JSON.stringify(ids)]);
  }
  await c.query('COMMIT');
 }catch(error){await c.query('ROLLBACK');throw error;}finally{c.release();}
 const c2=await ai.connect();try{
  await c2.query('BEGIN');await c2.query("SELECT pg_advisory_xact_lock(hashtext('isolated-preview-ai-seed'))");
  const old=(await c2.query('SELECT id,email FROM ai_accounts WHERE id=$1',[ids.aiAccount])).rows[0];
  if(old){if(old.email!=='preview@example.test')throw Error('Unexpected preview account binding');}
  else{
   if(Number((await c2.query('SELECT count(*) n FROM ai_accounts')).rows[0].n)!==0)throw Error('Refusing to seed a nonempty unmarked AI database');
   await c2.query("INSERT INTO ai_accounts(id,email,password_hash,name,business_name,role,status,city,address) VALUES($1,'preview@example.test',$2,'Vorschau Inhaber','Vorschau Restaurant','restaurant','active','Berlin','Synthetische Testadresse')",[ids.aiAccount,passwordHash(env.PREVIEW_OWNER_PASSWORD)]);
   await c2.query("INSERT INTO ai_locations(id,account_id,name) VALUES($1,$2,'Vorschau Küche')",[ids.aiLocation,ids.aiAccount]);
   await c2.query("INSERT INTO ai_stock(id,account_id,location_id,name,unit,quantity,minimum) VALUES($1,$2,$3,'Vorschau Mehl','kg',10,3)",[ids.aiStock,ids.aiAccount,ids.aiLocation]);
  }
  await c2.query('COMMIT');
 }catch(error){await c2.query('ROLLBACK');throw error;}finally{c2.release();}
 console.log('Synthetic POS and separate AI fixtures ready; existing fixtures preserved. No payment, receipt or supplier order was seeded.');
}finally{await pos.end();await ai.end();}
