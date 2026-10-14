import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {Readable} from 'node:stream';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {JSDOM} from 'jsdom';
import {createFiskalyTest,migrateFiskalyTest,sealTestCredentials,openTestCredentials,authenticateTest,FISKALY_AUTH_URL} from '../fiskaly-test.js';
const env={PASSWORD_PEPPER:'integration-only-secret'},company=crypto.randomUUID(),other=crypto.randomUUID();
const value={companyId:company,apiKey:'test_integration_key',apiSecret:'test-secret-value'};
const encrypted=sealTestCredentials(value,env);assert(!encrypted.includes(value.apiSecret));assert.deepEqual(openTestCredentials(encrypted,company,env),value);assert.throws(()=>openTestCredentials(encrypted,other,env));assert.throws(()=>sealTestCredentials(value,{}));
let remoteCalls=0,remoteStatus=200;
const fetcher=async(url,options)=>{remoteCalls++;assert.equal(url,FISKALY_AUTH_URL);assert.equal(options.redirect,'error');assert.equal(options.method,'POST');assert.deepEqual(JSON.parse(options.body),{api_key:value.apiKey,api_secret:value.apiSecret});return {ok:remoteStatus===200,status:remoteStatus,json:async()=>remoteStatus===200?{access_token:'private-access-token',refresh_token:'private-refresh-token'}:{error:value.apiSecret}}};
await assert.rejects(authenticateTest({...value,apiKey:'live_anything'},fetcher));assert.equal(remoteCalls,0);
await assert.rejects(authenticateTest(value,async()=>{throw Error(value.apiSecret)}),error=>!error.message.includes(value.apiSecret));
const db=new PGlite(),pool={query:async(sql,args=[])=>{const result=await db.query(sql,args);return {...result,rowCount:result.affectedRows??result.rows.length}}};
await db.exec(`CREATE TABLE companies(id uuid PRIMARY KEY);CREATE TABLE users(id uuid PRIMARY KEY,company_id uuid,role text,status text,must_change_password boolean DEFAULT false);CREATE TABLE sessions(token_hash text,user_id uuid,expires_at timestamptz);`);
await pool.query('INSERT INTO companies VALUES($1),($2)',[company,other]);
for(const [token,cid,role] of [['owner',company,'owner'],['other',other,'owner'],['waiter',company,'waiter']]){const id=crypto.randomUUID();await pool.query("INSERT INTO users(id,company_id,role,status) VALUES($1,$2,$3,'active')",[id,cid,role]);await pool.query("INSERT INTO sessions VALUES($1,$2,now()+interval '1 hour')",[crypto.createHash('sha256').update(token).digest('hex'),id])}
await migrateFiskalyTest(pool);await migrateFiskalyTest(pool);
function handler(){return createFiskalyTest(pool,{env,fetcher})}
async function request(handle,method='GET',body,token='owner',suffix=''){const req=Readable.from(body===undefined?[]:[typeof body==='string'?body:JSON.stringify(body)]);Object.assign(req,{url:'/api/v1/fiskaly-test'+suffix,method,headers:{authorization:token?'Bearer '+token:''}});let code,data,headers;assert.equal(await handle(req,{writeHead(c,h){code=c;headers=h},end(b){data=JSON.parse(b)}}),true);assert.equal(headers['cache-control'],'no-store');assert(!JSON.stringify(data).includes(value.apiSecret));assert(!JSON.stringify(data).includes('private-access-token'));return {code,data}}
let handle=handler();assert.equal((await request(handle,'GET',undefined,'')).code,401);assert.equal((await request(handle,'GET',undefined,'waiter')).code,403);
assert.equal((await request(handle,'PUT',{...value,apiKey:'live_forbidden'})).code,400);assert.equal(remoteCalls,0);
handle=handler();assert.equal((await request(handle,'PUT','null')).code,400);
handle=handler();assert.equal((await request(handle,'PUT',value)).code,200);assert.equal(remoteCalls,1);assert.equal((await request(handle,'POST',{},'owner','/test')).code,429);
const stored=(await pool.query('SELECT * FROM fiskaly_test_credentials')).rows[0];assert(!JSON.stringify(stored).includes(value.apiSecret));assert.deepEqual(openTestCredentials(stored.payload,company,env),value);
const status=await request(handle);assert.equal(status.data.configured,true);assert.equal(status.data.apiKey,undefined);assert.equal(status.data.payload,undefined);assert.equal((await request(handle,'GET',undefined,'other')).data.configured,false);
assert.equal((await request(handler(),'POST',{},'owner','/test')).code,200);
remoteStatus=401;assert.equal((await request(handler(),'PUT',value)).code,422);assert.equal((await pool.query('SELECT payload FROM fiskaly_test_credentials')).rows[0].payload,stored.payload);
assert.equal((await request(handler(),'POST',{},'owner','/test')).code,422);assert.equal((await request(handle)).data.status,'failed');
assert.equal((await request(handler(),'DELETE',undefined,'other')).code,200);assert.equal((await request(handle)).data.configured,true);
assert.equal((await request(handle,'DELETE')).code,200);assert.equal((await request(handle)).data.configured,false);
const dom=new JSDOM(fs.readFileSync(new URL('../../apps/web/public/pos/fiskaly-test.html',import.meta.url),'utf8'),{url:'https://bringness.de/pos/fiskaly-test.html',runScripts:'outside-only'}),w=dom.window;w.localStorage.setItem('bringness-pos-token','owner');w.AbortSignal.timeout=()=>undefined;let posted;
w.fetch=async(url,options)=>{posted=options;return {ok:true,json:async()=>options.method==='GET'?{configured:false}:{configured:true,status:'connected',message:'Test erfolgreich'}}};
w.eval(fs.readFileSync(new URL('../../apps/web/public/pos/fiskaly-test.js',import.meta.url),'utf8'));await new Promise(r=>setTimeout(r,10));assert.equal(w.document.getElementById('credentials').hidden,false);w.document.getElementById('apiKey').value=value.apiKey;w.document.getElementById('apiSecret').value=value.apiSecret;w.document.getElementById('eye').click();assert.equal(w.document.getElementById('apiSecret').type,'text');w.document.getElementById('credentials').dispatchEvent(new w.Event('submit',{cancelable:true}));await new Promise(r=>setTimeout(r,10));assert.equal(JSON.parse(posted.body).apiSecret,value.apiSecret);assert.equal(w.document.getElementById('apiSecret').value,'');assert.equal(w.document.getElementById('apiSecret').type,'password');assert(!JSON.stringify({...w.localStorage}).includes(value.apiSecret));assert.equal(w.document.getElementById('testSaved').hidden,false);w.close();await db.close();
console.log('Fiskaly TEST passed: tenant/role protection, authenticated encryption, no credential/token responses, TEST-only fixed endpoint, provider failure handling, throttling, removal, masked UI and no browser secret persistence.');
