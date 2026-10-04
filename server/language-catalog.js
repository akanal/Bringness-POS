import fs from 'node:fs';
import pg from 'pg';
import {languageDatabaseName,languageConnection,seedLanguages,readLanguages} from './language-catalog-core.js';
const seed=JSON.parse(fs.readFileSync(new URL('../apps/web/public/shared-language-catalog.json',import.meta.url),'utf8'));
const ssl=process.env.NODE_ENV==='production'?{rejectUnauthorized:false}:false;
let pool,ready=false,initializing,lastFailure=0;
export async function ensureLanguageDatabase() {
  if(ready)return;
  if(initializing)return initializing;
  if(Date.now()-lastFailure<30000)throw Error('Language database unavailable');
  initializing=(async()=>{
    const connectionString=languageConnection(process.env);
    const adminUrl=new URL(connectionString);adminUrl.pathname='/postgres';
    const admin=new pg.Pool({connectionString:adminUrl.toString(),ssl,connectionTimeoutMillis:5000,max:1});
    let c;
    try {
      c=await admin.connect();
      await c.query("SELECT pg_advisory_lock(hashtext('bringness_language_database_bootstrap'))");
      const exists=await c.query('SELECT 1 FROM pg_database WHERE datname=$1',[languageDatabaseName]);
      if(!exists.rowCount)await c.query('CREATE DATABASE "bringness_languages"');
    } finally {if(c)await c.query("SELECT pg_advisory_unlock(hashtext('bringness_language_database_bootstrap'))").catch(()=>{});c?.release();await admin.end()}
    if(!pool){pool=new pg.Pool({connectionString,ssl,max:2,connectionTimeoutMillis:5000,statement_timeout:5000});pool.on('error',error=>{ready=false;lastFailure=Date.now();console.error('Language database idle connection:',error.code||error.name)})}
    await seedLanguages(pool,seed);ready=true;
    console.log('Shared language database ready: bringness_languages');
  })();
  try{await initializing}catch(error){lastFailure=Date.now();throw error}finally{initializing=null}
}
export async function handleLanguageCatalog(req,res) {
  const url=new URL(req.url,'http://localhost');
  if(url.pathname!=='/api/languages/catalog')return false;
  const send=(code,value)=>{res.writeHead(code,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(value))};
  if(req.method!=='GET'){send(405,{error:'GET required'});return true}
  const system=url.searchParams.get('system');
  if(!['ai','pos'].includes(system)){send(400,{error:'Unknown language namespace'});return true}
  try{await ensureLanguageDatabase();send(200,{...await readLanguages(pool,system),storage:'shared-database',database:languageDatabaseName})}
  catch(error){console.error('Shared language catalog unavailable:',error.code||error.name);send(503,{error:'Sprachdatenbank vorübergehend nicht erreichbar. Lokales Sprachpaket verwenden.'})}
  return true;
}
