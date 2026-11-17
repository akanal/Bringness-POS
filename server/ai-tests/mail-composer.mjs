import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {Readable} from 'node:stream';
import {PGlite} from '@electric-sql/pglite';
import {JSDOM} from 'jsdom';
import fs from 'node:fs';
import {createMailComposer} from '../mail-composer.js';
import {migrateTransactionalMail,createMailWorker,enqueueMail} from '../transactional-mail.js';
import {renderBringnessMail} from '../../apps/web/public/admin/mail-renderer.js';
let pool,query,close,postgres=false;
if(process.env.MAIL_COMPOSER_TEST_DATABASE_URL){
 const url=new URL(process.env.MAIL_COMPOSER_TEST_DATABASE_URL);assert(['localhost','127.0.0.1','::1','[::1]'].includes(url.hostname));assert(url.pathname.endsWith('_test'));
 const {default:pg}=await import('pg'),schema='mail_test_'+crypto.randomBytes(8).toString('hex'),root=new pg.Pool({connectionString:url.href});
 await root.query('CREATE SCHEMA '+schema);pool=new pg.Pool({connectionString:url.href,options:'-c search_path='+schema+',public'});query=(...args)=>pool.query(...args);postgres=true;
 close=async()=>{await pool.end();await root.query('DROP SCHEMA '+schema+' CASCADE');await root.end();};
}else{
 const db=new PGlite();await db.waitReady;query=async(sql,args)=>{if(args===undefined&&sql.includes(';')){await db.exec(sql);return {rows:[],rowCount:0};}const r=await db.query(sql,args);return {...r,rowCount:r.affectedRows||r.rows.length};};pool={query,connect:async()=>({query,release(){}})};close=()=>db.close();
}
try{
 await query(`CREATE TABLE users(id uuid PRIMARY KEY,status text,must_change_password boolean DEFAULT false);CREATE TABLE sessions(token_hash text,user_id uuid,expires_at timestamptz);CREATE TABLE platform_admins(user_id uuid,active boolean);
 CREATE TABLE orders(id uuid,status text,total_cents int,guest_email text);CREATE TABLE receipts(id uuid,order_id uuid,issued_at timestamptz);CREATE TABLE payments(order_id uuid,amount_cents int);CREATE TABLE center_order_payments(order_id uuid,released_at timestamptz);`);
 await migrateTransactionalMail(pool);
 const admin=crypto.randomUUID(),other=crypto.randomUUID(),hash=s=>crypto.createHash('sha256').update(s).digest('hex');
 for(const [id,token]of [[admin,'platform'],[other,'other']]){await query("INSERT INTO users(id,status) VALUES($1,'active')",[id]);await query("INSERT INTO sessions VALUES($1,$2,now()+interval '1 hour')",[hash(token),id]);}
 await query('INSERT INTO platform_admins VALUES($1,true)',[admin]);
 const handler=createMailComposer(pool,{probe:async()=>({available:true,status:'ready'})}),base='/api/v1/platform/mail/composer';
 async function call(path=base,body=null,token='platform',custom=handler,origin='https://bringness.de'){
  const req=Readable.from(body===null?[]:[typeof body==='string'?body:JSON.stringify(body)]);Object.assign(req,{url:path,method:body===null?'GET':'POST',headers:{authorization:token?'Bearer '+token:'',origin,'content-type':'application/json'}});
  let status,data;assert.equal(await custom(req,{writeHead(s){status=s;},end(raw){data=JSON.parse(raw);}}),true);return {httpStatus:status,status,...data};
 }
 assert.equal((await call(base,null,'')).status,401);assert.equal((await call(base,null,'other')).status,403);
 assert.equal((await call()).from,'Bringness <service@bringness.de>');
 const input={requestKey:crypto.randomUUID(),to:'fixture@example.test',subject:'Bringness Test',text:'Guten Tag,\n\nPRIVATE-CONTENT'};
 assert.equal((await call(base,input,'platform',handler,'https://foreign.test')).status,403);
 assert.equal((await call(base,'{')).status,400);assert.equal((await call(base,'x'.repeat(50000))).status,413);
 assert.equal((await call(base,input,'platform',createMailComposer(pool,{env:{BRINGNESS_PREVIEW_MODE:'isolated'}}))).status,403);
 const first=await call(base,input);assert.equal(first.httpStatus,202);
 const replay=await call(base,input);assert.equal(replay.id,first.id);
 assert.equal((await call(base,{...input,text:'changed'})).status,409);
 assert.equal((await query('SELECT count(*)::int n FROM composed_mail')).rows[0].n,1);
 assert(!(await query('SELECT payload FROM composed_mail')).rows[0].payload.includes('PRIVATE-CONTENT'));
 assert.equal((await call(base+'/'+first.id)).status,'pending');assert.equal((await call(base+'/'+first.id,null,'other')).status,403);
 await query('INSERT INTO platform_admins VALUES($1,true)',[other]);assert.equal((await call(base+'/'+first.id,null,'other')).status,404);
 if(postgres){const input2={...input,requestKey:crypto.randomUUID()};const results=await Promise.all(Array.from({length:4},()=>call(base,input2)));assert.equal(new Set(results.map(r=>r.id)).size,1);}
 let sends=0,last;const env={SMTP_HOST:'fixture',SMTP_USER:'fixture',SMTP_PASSWORD:'fixture',SMTP_FROM:'noreply@example.test'};
 const legacy=createMailWorker(pool,{env,connect:async()=>{throw Error('Legacy worker must not claim composed mail');}});await legacy();assert.equal((await call(base+'/'+first.id)).status,'pending');
 const worker=createMailWorker(pool,{env,queue:'composed_mail',connect:async()=>({async sendMail(mail){last=mail;sends++;return {accepted:[mail.to]};},close(){}})});
 await worker();assert.equal(sends,postgres?2:1);assert.equal(last.from,'Bringness <service@bringness.de>');assert.equal(last.replyTo,'info@bringness.de');assert(last.html.includes('cid:bringness-logo@bringness.de'));
 assert.equal((await call(base+'/'+first.id)).status,'sent');assert.equal((await query('SELECT payload FROM composed_mail WHERE id=$1',[first.id])).rows[0].payload,'');
 await call(base,input);await worker();assert.equal(sends,postgres?2:1);
 const ambiguous=await call(base,{...input,requestKey:crypto.randomUUID()});
 const uncertain=createMailWorker(pool,{env,queue:'composed_mail',connect:async()=>({async sendMail(){throw Object.assign(Error('ambiguous DATA'),{code:'ESOCKET'});},close(){}})});await uncertain();await uncertain();assert.equal((await call(base+'/'+ambiguous.id)).status,'review');assert.equal((await query('SELECT attempts FROM composed_mail WHERE id=$1',[ambiguous.id])).rows[0].attempts,1);
 const oldKey='composer:'+admin+':legacy-fixture';await enqueueMail(pool,oldKey,input.to,{kind:'composer',subject:'Legacy test',text:'Legacy'});
 await migrateTransactionalMail(pool);await migrateTransactionalMail(pool);assert.equal((await query('SELECT status FROM transactional_mail WHERE dedupe_key=$1',[oldKey])).rows[0].status,'review');assert.equal((await query('SELECT status FROM composed_mail WHERE dedupe_key=$1',[oldKey])).rows[0].status,'review');await legacy();await worker();assert.equal(sends,postgres?2:1);
 for(let i=0;i<20;i++)await query("INSERT INTO composed_mail(dedupe_key,recipient,payload,status) VALUES($1,'fixture@example.test','','sent')",['composer:'+admin+':rate:'+i]);
 assert.equal((await call(base,{...input,requestKey:crypto.randomUUID()})).status,429);
 await query("UPDATE sessions SET expires_at=now()-interval '1 hour' WHERE user_id=$1",[admin]);assert.equal((await call(base,input)).status,403);
}finally{await close();}
// Exercise the shipped form code with a lost submission response and explicit same-key reconciliation.
const root=new URL('../../apps/web/public/admin/',import.meta.url),dom=new JSDOM(fs.readFileSync(new URL('mail.html',root),'utf8'),{url:'https://bringness.de/admin/mail.html',runScripts:'outside-only'}),w=dom.window;
w.localStorage.setItem('bringness-pos-token','synthetic');w.renderBringnessMail=renderBringnessMail;w.AbortSignal.timeout=()=>undefined;
let posts=[],lose=true;w.fetch=async(path,options)=>{if(!options.method)return {ok:true,json:async()=>({smtp:{available:true}})};posts.push(JSON.parse(options.body));if(lose){lose=false;throw Error('lost response');}return {ok:true,json:async()=>({id:'11111111-1111-4111-8111-111111111111',status:'pending'})};};
const source=fs.readFileSync(new URL('mail-composer.js',root),'utf8').replace(/^import .*\n/,'');await w.eval('(async()=>{'+source+'})()');
const $=id=>w.document.getElementById(id);assert.equal($('workspace').hidden,false);
$('to').value='fixture@example.test';$('subject').value='Test';$('text').value='<script>example</script>';$('text').dispatchEvent(new w.Event('input'));
assert($('preview').srcdoc.includes('&lt;script&gt;'));assert.equal($('preview').getAttribute('sandbox'),'');
$('compose').dispatchEvent(new w.Event('submit',{cancelable:true}));await new Promise(resolve=>setTimeout(resolve,0));assert($('text').readOnly);assert($('notice').textContent.includes('Bestätigung fehlt'));
await $('check').onclick();assert.equal(posts.length,2);assert.equal(posts[0].requestKey,posts[1].requestKey);assert.deepEqual(posts[0],posts[1]);
Object.defineProperty($('compose'),'reset',{value:$('reset'),configurable:true});
w.confirm=()=>true;$('reset').click();assert.equal($('to').value,'');assert.equal($('text').readOnly,false);dom.window.close();
console.log('Mail composer passed: access/origin/body limits, encrypted single-recipient queue, fixed sender, idempotency, uncertain handoff, rate limit, safe preview and lost-response reconciliation'+(postgres?', PostgreSQL concurrent replay':'')+'.');
