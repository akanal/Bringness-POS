// Actual current application entrypoint against an explicitly disposable CI PostgreSQL.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import net from 'node:net';
import crypto from 'node:crypto';
import pg from 'pg';
import {pathToFileURL} from 'node:url';
const url=new URL(process.env.SHOP_INTEGRATION_DATABASE_URL||'invalid:');
assert.ok(['postgres:','postgresql:'].includes(url.protocol)&&['localhost','127.0.0.1'].includes(url.hostname)&&url.pathname==='/bringness_shop_integration','Disposable integration database required');
const pool=new pg.Pool({connectionString:url.href});assert.equal(Number((await pool.query('SELECT count(*) n FROM information_schema.tables WHERE table_schema=current_schema()')).rows[0].n),0,'Integration database must be empty');
const listener=net.createServer();await new Promise(r=>listener.listen(0,'127.0.0.1',r));const port=listener.address().port;await new Promise(r=>listener.close(r));const base='http://127.0.0.1:'+port;
const child=spawn(process.execPath,['server/start.js'],{env:{PATH:process.env.PATH,NODE_ENV:'test',APP_MODE:'pos',PORT:String(port),DATABASE_URL:url.href,PASSWORD_PEPPER:crypto.randomBytes(32).toString('hex')},stdio:['ignore','pipe','pipe']});let output='';for(const stream of [child.stdout,child.stderr])stream.on('data',b=>{output=(output+b).slice(-30000);});
let browser;const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function post(path,value,token){const res=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://bringness-pos.de',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(value)});return {status:res.status,value:await res.json()};}
try{
 let ready=false;for(let i=0;i<120;i++){if(child.exitCode!==null)throw Error('Application exited before readiness');try{const r=await post('/api/v1/shop/registrations',{});if(r.status===400){ready=true;break;}}catch{}await pause(500);}assert.ok(ready,'Application registration never became ready');
 const html=await (await fetch(base+'/shop/')).text();assert.match(html,/brand-wordmark/);assert.ok(!html.includes('src="/brand-logo.js"'));assert.equal((await fetch(base+'/shop')).status,200);
 const password='FixtureOwner1!'+crypto.randomBytes(12).toString('hex');
 async function account(label){const email=label+'-'+crypto.randomUUID()+'@example.test',requestId=crypto.randomUUID(),registration={companyName:'CI Shop '+label,ownerName:'CI Owner '+label,email,password,street:'Fixture 1',postalCode:'00123',city:'Berlin',country:'DE'};const r=await post('/api/v1/shop/registrations',{requestId,registration});assert.equal(r.status,200,JSON.stringify(r.value));assert.equal((await post('/api/v1/shop/registrations',{requestId,registration})).value.replay,true);const login=await post('/api/v1/auth/login',{email,password});assert.equal(login.status,200);assert.match(login.value.token,/^[a-f0-9]{64}$/);return {email,token:login.value.token};}
 const a=await account('A'),b=await account('B');const quote=await post('/api/v1/shop/preview',{cart:{'pos-online':1}},a.token);assert.equal(quote.status,200);assert.deepEqual(quote.value.issues,[]);const line=quote.value.lines[0];assert.ok(Number.isSafeInteger(line.grossCents));
 const requestId=crypto.randomUUID(),draft=await post('/api/v1/shop/drafts',{requestId,cart:{'pos-online':1}},a.token);assert.equal(draft.status,200);assert.equal((await post('/api/v1/shop/drafts',{requestId,cart:{'pos-online':1}},a.token)).value.id,draft.value.id);
 const checkout=await post('/api/v1/shop/checkouts',{requestId:crypto.randomUUID(),draftId:draft.value.id,acceptedNetCents:line.netCents,acceptedGrossCents:line.grossCents},a.token);assert.equal(checkout.status,200);assert.equal(checkout.value.status,'prepared');assert.equal(checkout.value.canPay,false);
 assert.equal((await fetch(base+'/api/v1/shop/drafts/'+draft.value.id,{headers:{Authorization:'Bearer '+b.token}})).status,404);
 const history=await fetch(base+'/api/v1/shop/checkouts/history',{headers:{Authorization:'Bearer '+a.token}});assert.equal(history.status,200);
 const companies=(await pool.query('SELECT company_id FROM users WHERE email=ANY($1::text[])',[[a.email,b.email]])).rows.map(r=>r.company_id);for(const table of ['billing_transactions','company_entitlements','company_features'])assert.equal(Number((await pool.query('SELECT count(*) n FROM '+table+' WHERE company_id=ANY($1::uuid[])',[companies])).rows[0].n),0,table+' must remain empty');
 if(process.env.SHOP_PLAYWRIGHT_PATH){const {chromium}=await import(pathToFileURL(process.env.SHOP_PLAYWRIGHT_PATH));browser=await chromium.launch({headless:true});const context=await browser.newContext(),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await context.route('**/*',r=>r.request().url().startsWith(base)?r.continue():r.abort());
  for(const width of [1600,1280,768,390]){await page.setViewportSize({width,height:900});await page.goto(base+'/shop/');await page.locator('.brand-wordmark').waitFor();assert.equal(await page.locator('a.brand img').count(),0);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),'Shop overflow '+width);}
  await page.goto(base+'/shop/account.html');await page.locator('[name=email]').fill(a.email);await page.locator('[name=password]').fill(password);await page.getByRole('button',{name:'Anmelden',exact:true}).click();await page.locator('#shop-login-host a:not([hidden])').waitFor();assert.match(await page.evaluate(()=>localStorage.getItem('bringness-pos-token')),/^[a-f0-9]{64}$/);assert.deepEqual(errors,[]);await context.close();
 }
 console.log('Actual entrypoint + PostgreSQL: registration/replay, real login, quote, draft/replay, prepared checkout, account isolation, history and no financial grants passed.');
}catch(error){console.error('Integration failed:',error.message);console.error(output);throw error;}finally{await browser?.close();child.kill('SIGTERM');await new Promise(resolve=>{if(child.exitCode!==null)return resolve();child.once('exit',resolve);setTimeout(()=>{child.kill('SIGKILL');resolve();},5000).unref();});await pool.end();}
