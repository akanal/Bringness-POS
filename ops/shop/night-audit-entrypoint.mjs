import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import crypto from 'node:crypto';
import net from 'node:net';
import {pathToFileURL} from 'node:url';
import pg from 'pg';
import {marketplaceNightAuditBrowserChecks} from './marketplace-night-audit-browser.mjs';
// A separate disposable database/process preserves production registration limits.
const url=new URL(process.env.SHOP_NIGHT_DATABASE_URL||'invalid:');
assert.ok(['postgres:','postgresql:'].includes(url.protocol)&&['localhost','127.0.0.1'].includes(url.hostname)&&url.pathname==='/bringness_shop_night_audit'&&url.username==='shop_test','Explicit disposable night-audit database required');
assert.ok(process.env.SHOP_PLAYWRIGHT_PATH,'Native browser dependency required');
const adminUrl=new URL(url);adminUrl.pathname='/postgres';const admin=new pg.Pool({connectionString:adminUrl.href});try{await admin.query('CREATE DATABASE bringness_shop_night_audit');}finally{await admin.end();}
const pool=new pg.Pool({connectionString:url.href});assert.equal(Number((await pool.query('SELECT count(*) n FROM information_schema.tables WHERE table_schema=current_schema()')).rows[0].n),0,'Night-audit database must be empty');
const listener=net.createServer();await new Promise(r=>listener.listen(0,'127.0.0.1',r));const port=listener.address().port;await new Promise(r=>listener.close(r));const base='http://127.0.0.1:'+port;
const child=spawn(process.execPath,['server/start.js'],{env:{PATH:process.env.PATH,NODE_ENV:'test',APP_MODE:'pos',SHOP_MARKETPLACE_ENABLED:'true',PORT:String(port),DATABASE_URL:url.href,PASSWORD_PEPPER:crypto.randomBytes(32).toString('hex')},stdio:['ignore','pipe','pipe']});let output='',browser;
for(const stream of [child.stdout,child.stderr])stream.on('data',b=>{output=(output+b).slice(-12000);});
try{let ready=false;for(let i=0;i<120;i++){if(child.exitCode!==null)throw Error('Night-audit app exited before readiness');try{const r=await fetch(base+'/api/v1/shop/registrations',{method:'POST',headers:{Origin:'https://bringness.de','Content-Type':'application/json'},body:'{}'});if(r.status===400){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,500));}assert.ok(ready,'Night-audit app not ready');
 const {chromium}=await import(pathToFileURL(process.env.SHOP_PLAYWRIGHT_PATH));browser=await chromium.launch({headless:true,...(process.env.SHOP_BROWSER_CHANNEL==='chrome'?{channel:'chrome'}:{})});await marketplaceNightAuditBrowserChecks({browser,base,artifacts:process.env.SHOP_DESIGN_ARTIFACTS});
 assert.equal(Number((await pool.query("SELECT count(*) n FROM companies WHERE name LIKE 'CI Nachtprüfung %'")).rows[0].n),3);console.log('Night-audit actual production startup and three explicit browser registrations passed with unchanged registration limits.');
}catch(error){console.error(output);throw error;}finally{await browser?.close();child.kill('SIGTERM');await new Promise(resolve=>{if(child.exitCode!==null)return resolve();child.once('exit',resolve);setTimeout(()=>{child.kill('SIGKILL');resolve();},5000).unref();});await pool.end();}
