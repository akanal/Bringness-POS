import test from 'node:test';
import assert from 'node:assert/strict';
import {validatePreviewEnvironment,createPreviewAccess,blockedPreviewFetch,isolatedPreview} from './preview-policy.js';
import {connectSmtp} from './smtp-mail.js';
const configuration=()=>({BRINGNESS_PREVIEW_MODE:'isolated',NODE_ENV:'development',APP_MODE:'combined',PORT:'3000',PREVIEW_HOST:'demo.bringness-pos.de',PUBLIC_BASE_URL:'https://demo.bringness-pos.de',PUBLIC_URL:'https://demo.bringness-pos.de',AI_DATABASE_NAME:'bringness_ai_preview',PREVIEW_ACCESS_USER:'bringness-preview',PREVIEW_ACCESS_PASSWORD:'a'.repeat(40),PREVIEW_SESSION_SECRET:'b'.repeat(40),PASSWORD_PEPPER:'c'.repeat(40),AI_DB_PASSWORD:'d'.repeat(40),PREVIEW_OWNER_PASSWORD:'Aa1!'+ 'x'.repeat(40),DATABASE_URL:'postgresql://preview_admin:'+ 'e'.repeat(40)+'@preview-db:5432/bringness_preview'});
const response=()=>({headers:{},setHeader(k,v){this.headers[k]=v;},writeHead(status,headers){this.status=status;Object.assign(this.headers,headers);},end(body){this.body=body;}});
test('isolated preview accepts only its separate runtime and database identity',()=>{
 const env=configuration();assert.equal(validatePreviewEnvironment(env).host,'demo.bringness-pos.de');assert.equal(isolatedPreview({}),false);
 for(const patch of [{BRINGNESS_PREVIEW_MODE:''},{NODE_ENV:'production'},{APP_MODE:'ai'},{PORT:'80'},{PREVIEW_HOST:'bringness.de'},{PUBLIC_URL:'https://bringness.de'},{AI_DATABASE_NAME:'bringness_ai'},{DATABASE_URL:env.DATABASE_URL.replace('preview-db','production-db')},{DATABASE_URL:env.DATABASE_URL+'?sslmode=require'},{DATABASE_URL:env.DATABASE_URL.replace('bringness_preview','bringness_prod')},{PREVIEW_ACCESS_PASSWORD:'short'},{PASSWORD_PEPPER:env.PREVIEW_SESSION_SECRET}])assert.throws(()=>validatePreviewEnvironment({...env,...patch}),/Unsafe/);
});
test('live and test provider credentials are both rejected without printing values',()=>{
 for(const key of ['MOLLIE_API_KEY','FISKALY_API_SECRET','SMTP_PASSWORD','VAPID_PRIVATE_KEY','NETCUP_SSH_KEY','AWS_SECRET_ACCESS_KEY','WINDOWS_CSC_LINK']){
  assert.throws(()=>validatePreviewEnvironment({...configuration(),[key]:'sensitive-fixture-value'}),error=>error.message.includes(key)&&!error.message.includes('sensitive-fixture-value'));
 }
});
test('preview access blocks anonymous requests and never treats an application bearer as preview authorization',()=>{
 const access=createPreviewAccess(validatePreviewEnvironment(configuration()));
 for(const headers of [{},{authorization:'Bearer application-token'},{authorization:'Basic !!!'},{authorization:'Basic '+Buffer.from('wrong:wrong').toString('base64')}]){
  const res=response();assert.equal(access({headers},res),true);assert.equal(res.status,401);assert.match(res.headers['www-authenticate'],/^Basic/);assert.match(res.headers['x-robots-tag'],/noindex/);
 }
});
test('preview access exchanges Basic credentials for a secure cookie that permits normal bearer API authentication',()=>{
 const env=configuration();let now=1800000000000;const access=createPreviewAccess(validatePreviewEnvironment(env),{clock:()=>now});
 const res=response();assert.equal(access({headers:{authorization:'Basic '+Buffer.from(env.PREVIEW_ACCESS_USER+':'+env.PREVIEW_ACCESS_PASSWORD).toString('base64')}},res),false);
 const cookie=res.headers['set-cookie'];assert.match(cookie,/HttpOnly; Secure; SameSite=Strict/);assert(!cookie.includes(env.PREVIEW_ACCESS_PASSWORD));
 const header=cookie.split(';')[0];assert.equal(access({headers:{authorization:'Bearer app-session',cookie:header}},response()),false);
 assert.equal(access({headers:{cookie:header+'x'}},response()),true);
 now+=3600001;assert.equal(access({headers:{cookie:header}},response()),true);
});
test('all preview fetch attempts fail before an outbound request',()=>{assert.throws(blockedPreviewFetch,error=>error.code==='PREVIEW_EGRESS_BLOCKED'&&!error.message.includes('https://'));});
test('SMTP preview mode refuses even an injected transport before connecting',async()=>{
 let called=false;await assert.rejects(connectSmtp({env:{BRINGNESS_PREVIEW_MODE:'isolated',SMTP_HOST:'fixture',SMTP_USER:'fixture',SMTP_PASSWORD:'fixture',SMTP_FROM:'fixture@example.test'},createTransport(){called=true;}}),error=>error.code==='PREVIEW_EGRESS_BLOCKED');assert.equal(called,false);
});

test('preview gateway denies provider actions even with valid preview access',()=>{
 const env=configuration(),access=createPreviewAccess(validatePreviewEnvironment(env));
 const authorization='Basic '+Buffer.from(env.PREVIEW_ACCESS_USER+':'+env.PREVIEW_ACCESS_PASSWORD).toString('base64');
 for(const url of ['/api/v1/billing/checkout','/api/v1/billing/cancel','/api/v1/mollie/webhook','/api/v1/fiskaly-test/setup','/api/v1/tse/sign','/api/ai/collection/setup','/api/ai/automatic-procurement/run','/api/v1/centers/mollie/connect','/api/v1/platform/control/accounts']){
  const res=response();assert.equal(access({url,method:'POST',headers:{authorization}},res),true);assert.equal(res.status,403);assert.equal(JSON.parse(res.body).code,'PREVIEW_ACTION_DISABLED');
 }
 const res=response();assert.equal(access({url:'/api/v1/orders/checkout',method:'POST',headers:{authorization}},res),false);
});
