import pg from 'pg';
const ssl=process.env.NODE_ENV==='production'?{rejectUnauthorized:false}:false;
const databaseName=process.env.AI_DATABASE_NAME||'bringness_ai';
const databaseUser='bringness_ai_app';
export function aiDatabaseConnection(env=process.env){
 if(!env.DATABASE_URL||!env.AI_DB_PASSWORD)throw Error('AI database configuration missing');
 const name=env.AI_DATABASE_NAME||'bringness_ai';if(!/^[a-z][a-z0-9_]{2,50}$/.test(name))throw Error('Invalid AI database name');
 const url=new URL(env.DATABASE_URL);if(decodeURIComponent(url.pathname.slice(1))===name)throw Error('AI database must differ from POS database');
 url.pathname='/'+name;url.username=databaseUser;url.password=env.AI_DB_PASSWORD;return url.toString();
}
export const platformPool=new pg.Pool({connectionString:process.env.DATABASE_URL,ssl});
let dedicatedPool;
export function aiPool(){if(!dedicatedPool)dedicatedPool=new pg.Pool({connectionString:aiDatabaseConnection(),ssl});return dedicatedPool}
export async function ensureAiDatabase(){
 const url=new URL(aiDatabaseConnection());
 // Bootstrap only uses the existing database administrator connection. Runtime AI
 // queries use a dedicated non-superuser role and a different database.
 const client=await platformPool.connect();
 try{
  await client.query("SELECT pg_advisory_lock(hashtext('bringness_ai_database_bootstrap'))");
  const role=await client.query('SELECT rolname,rolsuper,rolcreatedb,rolcreaterole FROM pg_roles WHERE rolname=$1',[databaseUser]);
  if(role.rowCount&&(role.rows[0].rolsuper||role.rows[0].rolcreatedb||role.rows[0].rolcreaterole))throw Error('AI database role has excessive privileges');
  const passwordLiteral=(await client.query('SELECT quote_literal($1) literal',[process.env.AI_DB_PASSWORD])).rows[0].literal;
  await client.query(`${role.rowCount?'ALTER':'CREATE'} ROLE "${databaseUser}" WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD ${passwordLiteral}`);
  const db=await client.query('SELECT pg_get_userbyid(datdba) owner FROM pg_database WHERE datname=$1',[databaseName]);
  if(db.rowCount&&db.rows[0].owner!==databaseUser)throw Error('AI database name already belongs to another owner');
  if(!db.rowCount)await client.query(`CREATE DATABASE "${databaseName}" OWNER "${databaseUser}"`);
  await client.query(`REVOKE ALL ON DATABASE "${databaseName}" FROM PUBLIC`);
  const target=await aiPool().connect();
  try{await target.query('REVOKE CREATE ON SCHEMA public FROM PUBLIC')}finally{target.release()}
 }finally{await client.query("SELECT pg_advisory_unlock(hashtext('bringness_ai_database_bootstrap'))").catch(()=>{});client.release()}
 if(url.pathname==='/')throw Error('AI database not selected');
}
const tables=['ai_accounts','ai_sessions','ai_auth_tokens','ai_auth_attempts','ai_settings','ai_locations','ai_stock','ai_stock_moves','ai_products','ai_orders','ai_audit'];
export async function copyLegacyAiData(){
 const c=await aiPool().connect(),sourceClient=await platformPool.connect();
 try{
  await sourceClient.query('BEGIN');
  const existing=[];for(const table of tables)if((await sourceClient.query('SELECT to_regclass($1) present',['public.'+table])).rows[0].present)existing.push(table);
  // Freeze legacy AI writes while copying, then make only these old AI tables
  // read-only. This avoids losing writes from the draining old deployment.
  if(existing.length)await sourceClient.query(`LOCK TABLE ${existing.map(t=>'"'+t+'"').join(',')} IN ACCESS EXCLUSIVE MODE`);
  await c.query('BEGIN');await c.query("SELECT pg_advisory_xact_lock(hashtext('bringness_ai_legacy_import'))");
  const completed=(await c.query("SELECT 1 FROM ai_settings WHERE key='legacyImportComplete'")).rowCount;
  if(!completed){
   for(const table of existing){
    const rows=(await sourceClient.query(`SELECT * FROM "${table}"`)).rows;
    for(const row of rows){
     const columns=Object.keys(row);if(columns.some(k=>!/^[a-z_]+$/.test(k)))throw Error('Unexpected legacy column');
     const values=columns.map(k=>row[k]),placeholders=columns.map((_,i)=>'$'+(i+1));
     const updateSettings=table==='ai_settings'?" ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value":" ON CONFLICT DO NOTHING";
     await c.query(`INSERT INTO "${table}" (${columns.map(k=>'"'+k+'"').join(',')}) VALUES (${placeholders.join(',')})${updateSettings}`,values);
    }
   }
   for(const table of ['ai_stock_moves','ai_audit'])await c.query(`SELECT setval(pg_get_serial_sequence('${table}','id'),GREATEST(COALESCE((SELECT max(id) FROM "${table}"),0),1),(SELECT count(*)>0 FROM "${table}"))`);
   await c.query("INSERT INTO ai_settings(key,value) VALUES('legacyImportComplete',$1)",[JSON.stringify({completedAt:new Date().toISOString(),sourceDatabase:existing.length?'pos_ai_tables':'none'})]);
  }
  if(existing.length){
   await sourceClient.query(`CREATE OR REPLACE FUNCTION public.ai_legacy_readonly() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'AI legacy tables are read-only after migration'; END $$`);
   for(const table of existing){await sourceClient.query(`DROP TRIGGER IF EXISTS ai_legacy_readonly ON "${table}"`);await sourceClient.query(`CREATE TRIGGER ai_legacy_readonly BEFORE INSERT OR UPDATE OR DELETE ON "${table}" FOR EACH STATEMENT EXECUTE FUNCTION public.ai_legacy_readonly()`)}
  }
  await c.query('COMMIT');await sourceClient.query('COMMIT');
 }catch(e){await c.query('ROLLBACK');await sourceClient.query('ROLLBACK');throw e}finally{c.release();sourceClient.release()}
}
