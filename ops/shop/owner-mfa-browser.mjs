import assert from 'node:assert/strict';import crypto from 'node:crypto';import {mkdir} from 'node:fs/promises';
import {totp} from '../../server/owner-mfa-crypto.js';
// Only called by the disposable localhost production-entrypoint fixture.
export async function ownerMfaBrowserChecks({browser,base,pool,adminToken,email,password,artifacts}){
 assert.equal(new URL(base).hostname,'127.0.0.1');
 const actor=(await pool.query('SELECT user_id FROM sessions WHERE token_hash=$1',[crypto.createHash('sha256').update(adminToken).digest('hex')])).rows[0];assert(actor);
 await pool.query('INSERT INTO platform_admins(user_id,active) VALUES($1,true) ON CONFLICT(user_id) DO UPDATE SET active=true',[actor.user_id]);
 const canonical='https://bringness.de';let currentToken=adminToken;
 const post=async(path,body,token)=>{const response=await fetch(base+'/api/v1/'+path,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body)});return {status:response.status,data:await response.json()}};
 for(const width of [390,1280]){
  const context=await browser.newContext({viewport:{width,height:900}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route(canonical+'/**',async route=>{const u=new URL(route.request().url());const response=await route.fetch({url:base+u.pathname+u.search,maxRedirects:0});await route.fulfill({response})});
  try{
   await page.goto(canonical+'/superadmin/');await page.evaluate(token=>localStorage.setItem('bringness-market-admin-token',token),currentToken);
   await page.goto(canonical+'/superadmin/security.html?from=market');await page.locator('#begin:visible').waitFor();
   assert.equal(await page.locator('.password-eye svg').count(),1);await page.locator('#eye').click();assert.equal(await page.locator('[name=password]').getAttribute('type'),'text');await page.locator('#eye').click();assert.equal(await page.locator('[name=password]').getAttribute('type'),'password');
   await page.locator('[name=password]').fill(password);await page.locator('#begin').click();await page.locator('#enrollment:visible').waitFor();
   const secret=await page.locator('#manual-key').inputValue(),codes=(await page.locator('#recovery-codes').inputValue()).split('\n');assert.equal(codes.length,10);assert.match(await page.locator('#qr').getAttribute('src'),/^data:image\/png;base64,/);
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));
   if(artifacts){await mkdir(artifacts,{recursive:true});await page.screenshot({path:artifacts+'/owner-mfa-enrollment-'+width+'.png',fullPage:true,animations:'disabled'})}
   await page.locator('#activate').click();await page.locator('#message').filter({hasText:'Wiederherstellungscodes sicher gespeichert'}).waitFor();assert.equal((await pool.query('SELECT enabled FROM platform_owner_mfa WHERE user_id=$1',[actor.user_id])).rows[0].enabled,false);
   const download=page.waitForEvent('download');await page.locator('#save-codes').click();assert.equal((await download).suggestedFilename(),'Bringness-Wiederherstellungscodes.txt');
   const old=await post('auth/login',{email,password});assert.equal(typeof old.data.token,'string');
   // Empty credentials and missing/invalid fields must produce visible feedback at the relevant step.
   await page.locator('[name=password]').fill('');await page.locator('#activate').click();await page.locator('#form-feedback').filter({hasText:'Passwort erneut'}).waitFor();assert(await page.locator('#form-feedback').evaluate(e=>{const r=e.getBoundingClientRect();return r.top>=-1&&r.bottom<=innerHeight+1}));
   await page.locator('[name=password]').fill(password);await page.locator('#saved').check();await page.locator('#activation-code').fill('12345');await page.locator('#activate').click();await page.locator('#activation-feedback').filter({hasText:'sechsstelligen'}).waitFor();
   assert(await page.locator('#activation-feedback').evaluate(e=>{const r=e.getBoundingClientRect();return r.top>=-1&&r.bottom<=innerHeight+1}),'validation feedback must be in the viewport');
   const rejected=['000000','111111','222222'].find(c=>![-2,-1,0,1,2].map(i=>totp(secret,Math.floor(Date.now()/30000)+i)).includes(c));await page.locator('#activation-code').fill(rejected);await page.locator('#activate').click();await page.locator('#activation-feedback').filter({hasText:'ungültig'}).waitFor();assert(await page.locator('#activation-feedback').evaluate(e=>{const r=e.getBoundingClientRect();return r.top>=-1&&r.bottom<=innerHeight+1}),'server error must remain next to activation');
   if(artifacts)await page.screenshot({path:artifacts+'/owner-mfa-feedback-'+width+'.png',animations:'disabled'});
   const valid=totp(secret,Math.floor(Date.now()/30000));await page.locator('#activation-code').fill(valid.slice(0,3)+' '+valid.slice(3));await page.locator('#activate').click();await page.locator('#state').filter({hasText:'Aktiv –'}).waitFor();assert.equal(await page.locator('#manual-key').inputValue(),'');assert.equal(await page.locator('#recovery-codes').inputValue(),'');assert.equal(await page.locator('[name=password]').inputValue(),'');
   const denied=await fetch(base+'/api/v1/platform/systems',{headers:{Authorization:'Bearer '+old.data.token}});assert.equal(denied.status,403);
   if(artifacts)await page.screenshot({path:artifacts+'/owner-mfa-enabled-'+width+'.png',fullPage:true,animations:'disabled'});
   assert.equal((await post('auth/logout',{},currentToken)).status,200);await page.evaluate(()=>localStorage.removeItem('bringness-market-admin-token'));
   await page.goto(canonical+'/superadmin/');await page.locator('#loginForm [name=email]').fill(email);await page.locator('#loginForm [name=password]').fill(password);const proof=page.waitForResponse(r=>r.url().endsWith('/api/v1/auth/login'));await page.locator('#loginForm [type=submit]').click();const primary=await (await proof).json();assert.equal(primary.mfaRequired,true);assert.equal(primary.token,undefined);
   const dialog=page.locator('dialog.owner-mfa-dialog');await dialog.waitFor();assert.equal(await page.evaluate(()=>localStorage.getItem('bringness-market-admin-token')),null);
   const steps=Array.from({length:5},(_,i)=>totp(secret,Math.floor(Date.now()/30000)+i-2));const wrong=['000000','111111','222222'].find(c=>!steps.includes(c));await dialog.locator('[name=code]').fill(wrong);await dialog.locator('[type=submit]').click();await dialog.locator('[role=status]').filter({hasText:'ungültig'}).waitFor();
   await dialog.locator('[name=code]').fill(totp(secret,Math.floor(Date.now()/30000)+1));await dialog.locator('[type=submit]').click();await page.locator('#app:not([hidden])').waitFor();currentToken=await page.evaluate(()=>localStorage.getItem('bringness-market-admin-token'));assert.match(currentToken,/^[a-f0-9]{64}$/);
   // Each existing central login surface handles a primary proof without storing it as a token.
   await page.goto(canonical+'/admin/ai-workspace.html?admin=1');await page.locator('form[data-form=login] [name=email]').fill(email);await page.locator('form[data-form=login] [name=password]').fill(password);await page.locator('form[data-form=login] button[type=submit]').click();await dialog.waitFor();await dialog.locator('[data-cancel]').click();assert.equal(await page.locator('form[data-form=login] [name=password]').inputValue(),password);
   await page.goto(canonical+'/admin/');await page.locator('#email').fill(email);await page.locator('#password').fill(password);await page.locator('#go').click();await dialog.waitFor();await dialog.locator('[data-cancel]').click();assert.equal(await page.locator('#password').inputValue(),password);
   await page.goto(canonical+'/admin/systems.html');await page.locator('#loginForm [name=email]').fill(email);await page.locator('#loginForm [name=password]').fill(password);await page.locator('#loginForm [type=submit]').click();await dialog.waitFor();await dialog.locator('[name=recovery]').check();await dialog.locator('[name=code]').fill(codes[0]);await dialog.locator('[type=submit]').click();await page.locator('#app:not([hidden])').waitFor();
   await page.goto(canonical+'/shop/account.html');await page.locator('#shop-login-host [name=email]').fill(email);await page.locator('#shop-login-host [name=password]').fill(password);await page.locator('#shop-login-host [type=submit]').click();await dialog.waitFor();
   // Moving to the authenticator on the same phone must not cancel the MFA stage.
   await page.evaluate(()=>{Object.defineProperty(document,'visibilityState',{configurable:true,get:()=> 'hidden'});document.dispatchEvent(new Event('visibilitychange'));Object.defineProperty(document,'visibilityState',{configurable:true,get:()=> 'visible'});document.dispatchEvent(new Event('visibilitychange'))});assert(await dialog.isVisible());
   await dialog.locator('[name=recovery]').check();await dialog.locator('[name=code]').fill(codes[1]);await dialog.locator('[type=submit]').click();await page.waitForURL(canonical+'/shop/');assert.match(await page.evaluate(()=>localStorage.getItem('bringness-shop-token')),/^[a-f0-9]{64}$/);
   await page.goto(canonical+'/superadmin/security.html?from=market');await page.locator('#state').filter({hasText:'Aktiv –'}).waitFor();await page.locator('#disable-section summary').click();await page.locator('[name=password]').fill(password);await page.locator('#disable-code').fill(codes[2]);await page.locator('#confirm-disable').check();await page.locator('#disable').click();await page.locator('#state').filter({hasText:'Noch nicht aktiviert'}).waitFor();
   const fresh=await post('auth/login',{email,password});assert.match(fresh.data.token,/^[a-f0-9]{64}$/);currentToken=fresh.data.token;assert.deepEqual(errors,[]);
  }finally{await context.close()}
 }
 console.log('Owner MFA native browser passed at390/1280: eye icon, staged QR and private code export, explicit saved-code confirmation, activation and session revocation, real OTP/recovery dialog across Markt/POS/AI/Shop, mobile authenticator visibility, disable and password-login restoration.');
}
