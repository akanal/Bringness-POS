import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {Readable} from 'node:stream';
import {PGlite} from '@electric-sql/pglite';
import {createPosDiagnosticReports,migratePosDiagnosticReports,cleanupPosDiagnosticReports,validateDiagnosticReport,diagnosticVersion} from '../pos-diagnostic-reports.js';
let db,pool,query,close,postgres=false;
if(process.env.POS_DIAGNOSTIC_TEST_DATABASE_URL){
 const url=new URL(process.env.POS_DIAGNOSTIC_TEST_DATABASE_URL);assert(['localhost','127.0.0.1','::1','[::1]'].includes(url.hostname));assert(url.pathname.endsWith('_test'));
 const {default:pg}=await import('pg'),schema='diagnostic_test_'+crypto.randomBytes(8).toString('hex'),root=new pg.Pool({connectionString:url.href});
 await root.query('CREATE SCHEMA '+schema);pool=new pg.Pool({connectionString:url.href,options:'-c search_path='+schema+',public'});query=(...args)=>pool.query(...args);postgres=true;
 close=async()=>{await pool.end();await root.query('DROP SCHEMA '+schema+' CASCADE');await root.end();};
}else{
 db=new PGlite();await db.waitReady;query=async(sql,args)=>{if(args===undefined&&sql.includes(';')){await db.exec(sql);return {rows:[],rowCount:0};}const r=await db.query(sql,args);return {...r,rowCount:r.affectedRows||r.rows.length};};pool={query,connect:async()=>({query,release(){}})};close=()=>db.close();
}
try{
 await query(`CREATE TABLE companies(id uuid PRIMARY KEY,name text);CREATE TABLE restaurants(id uuid PRIMARY KEY,company_id uuid REFERENCES companies(id),name text);
 CREATE TABLE users(id uuid PRIMARY KEY,company_id uuid,role text,status text,must_change_password boolean DEFAULT false);
 CREATE TABLE sessions(token_hash text,user_id uuid,expires_at timestamptz);CREATE TABLE platform_admins(user_id uuid,active boolean);
 CREATE TABLE audit_log(company_id uuid,actor_user_id uuid,event_type text,entity_type text,entity_id text,payload jsonb);`);
 await migratePosDiagnosticReports(pool);await migratePosDiagnosticReports(pool);
 const id=()=>crypto.randomUUID(),hash=text=>crypto.createHash('sha256').update(text).digest('hex');
 const company=id(),otherCompany=id(),restaurant=id(),otherRestaurant=id(),owner=id(),other=id(),admin=id();
 await query("INSERT INTO companies VALUES($1,'Fixture business'),($2,'Other business')",[company,otherCompany]);
 await query("INSERT INTO restaurants VALUES($1,$2,'Fixture restaurant'),($3,$4,'Other restaurant')",[restaurant,company,otherRestaurant,otherCompany]);
 for(const [user,cid,role,token]of [[owner,company,'owner','owner'],[other,otherCompany,'owner','other'],[admin,otherCompany,'admin','platform']]){await query("INSERT INTO users(id,company_id,role,status) VALUES($1,$2,$3,'active')",[user,cid,role]);await query("INSERT INTO sessions VALUES($1,$2,now()+interval '1 hour')",[hash(token),user]);}
 await query('INSERT INTO platform_admins VALUES($1,true)',[admin]);
 const handler=createPosDiagnosticReports(pool,{maxPerUser:200,maxGlobal:500}),base='/api/v1/pos-diagnostics',adminPath='/api/v1/platform/control/diagnostics';
 async function call(path,body=null,token='owner',custom=handler,origin='https://bringness.de'){
  const req=Readable.from(body===null?[]:[typeof body==='string'?body:JSON.stringify(body)]);req.url=path;req.method=body===null?'GET':'POST';req.headers={authorization:token?'Bearer '+token:'','content-type':'application/json',origin};
  let status,output,headers={};const res={setHeader(k,v){headers[k]=v;},writeHead(code,h){status=code;Object.assign(headers,h);},end(value){output=JSON.parse(value);}};
  assert.equal(await custom(req,res),true);return {status,headers,...output};
 }
 const report=(extra={})=>({eventId:id(),code:'POS-STOCK-NETWORK',version:diagnosticVersion,online:true,restaurantId:restaurant,...extra});
 assert(validateDiagnosticReport(report()));
 for(const extra of [{token:'secret'},{message:'private'},{url:'/private'},{time:'client time'},{code:'POS-LOGIN-AUTH'},{code:'POS-STOCK-REQUEST'},{code:'POS-TRADE-LIMIT'},{code:'POS-UNKNOWN-SERVER'},{version:'private-name'},{eventId:'bad'},{online:'yes'},{restaurantId:'bad'}])assert.equal(validateDiagnosticReport(report(extra)),null);
 assert.equal((await call(base,report(),'')).status,401);assert.equal((await call(base,report(),'owner',handler,'https://foreign.test')).status,403);
 assert.equal((await call(adminPath,null)).status,403);
 assert.equal((await call(base,report({restaurantId:otherRestaurant}))).status,403);
 assert.equal((await call(base,{...report(),companyId:otherCompany})).status,400);
 assert.equal((await call(base,'{"x":"'+('a'.repeat(1500))+'"}')).status,400);
 const first=report();assert.equal((await call(base,first)).status,202);assert.equal((await call(base,first)).status,202);
 assert.equal((await call(base,{...first,code:'POS-TRADE-SERVER'})).status,409);
 let stored=(await query('SELECT * FROM pos_diagnostic_reports WHERE company_id=$1',[company])).rows;assert.equal(stored.length,1);assert.equal(Number(stored[0].occurrences),1);assert.equal(stored[0].company_id,company);assert.equal(stored[0].restaurant_id,restaurant);
 assert.equal((await call(base,report({online:false}))).status,202);
 assert.equal((await call(base,report({restaurantId:otherRestaurant}),'other')).status,202);
 let list=await call(adminPath,null,'platform');assert.equal(list.status,200);assert.equal(list.reports.length,2);assert.equal(list.openCount,2);assert.equal((await call(adminPath+'/summary',null,'platform')).openCount,2);assert.equal((await call(adminPath+'/summary',null,'owner')).status,403);assert(!JSON.stringify(list).includes('token_hash'));assert(!JSON.stringify(list).includes(first.eventId));
 let item=list.reports.find(r=>r.company_id===company);assert.equal(Number(item.occurrences),2);assert.equal(item.online,false);
 assert.equal((await call(adminPath+'/'+item.id+'/status',{state:'resolved',revision:item.revision},'owner')).status,403);
 assert.equal((await call(adminPath+'/'+item.id+'/status',{state:'resolved',revision:item.revision+1},'platform')).status,409);
 assert.equal((await call(adminPath+'/'+item.id+'/status',{state:'acknowledged',revision:item.revision},'platform')).status,200);
 assert.equal((await call(base,report())).status,202);item=(await call(adminPath,null,'platform')).reports.find(r=>r.id===item.id);assert.equal(item.state,'acknowledged');
 assert.equal((await call(adminPath+'/'+item.id+'/status',{state:'resolved',revision:item.revision},'platform')).status,200);
 assert.equal((await call(adminPath+'?state=resolved',null,'platform')).reports.length,1);
 assert.equal((await call(base,report())).status,202);item=(await call(adminPath,null,'platform')).reports.find(r=>r.id===item.id);assert.equal(item.state,'open');
 assert.equal((await query("SELECT count(*)::int count FROM audit_log WHERE event_type='pos.diagnostic.status'")).rows[0].count,2);
 await query('UPDATE platform_admins SET active=false WHERE user_id=$1',[admin]);assert.equal((await call(adminPath,null,'platform')).status,403);await query('UPDATE platform_admins SET active=true WHERE user_id=$1',[admin]);
 await query("UPDATE users SET status='blocked' WHERE id=$1",[owner]);assert.equal((await call(base,report())).status,401);await query("UPDATE users SET status='active' WHERE id=$1",[owner]);
 const limited=createPosDiagnosticReports(pool,{maxPerUser:2,maxGlobal:10});assert.equal((await call(base,report(),'owner',limited)).status,202);assert.equal((await call(base,report(),'owner',limited)).status,202);const limit=await call(base,report(),'owner',limited);assert.equal(limit.status,429);assert.equal(limit.headers['Retry-After'],'60');
 await query("UPDATE pos_diagnostic_events SET created_at=now()-interval '2 days' WHERE event_id=$1",[first.eventId]);await cleanupPosDiagnosticReports(pool);assert.equal((await query('SELECT * FROM pos_diagnostic_events WHERE event_id=$1',[first.eventId])).rowCount,0);
 await query("UPDATE pos_diagnostic_reports SET last_seen_at=now()-interval '31 days' WHERE company_id=$1",[otherCompany]);await cleanupPosDiagnosticReports(pool);assert.equal((await query('SELECT * FROM pos_diagnostic_reports WHERE company_id=$1',[otherCompany])).rowCount,0);
 if(postgres){
  const event=report({code:'POS-DISPLAY-SERVER'});const before=await query('SELECT * FROM pos_diagnostic_reports WHERE code=$1',[event.code]);assert.equal(before.rowCount,0);
  const replies=await Promise.all([call(base,event),call(base,event)]);assert(replies.every(r=>r.status===202));let row=(await query('SELECT * FROM pos_diagnostic_reports WHERE code=$1',[event.code])).rows[0];assert.equal(Number(row.occurrences),1);
  const concurrent=await Promise.all([call(base,report({code:event.code})),call(adminPath+'/'+row.id+'/status',{state:'resolved',revision:row.revision},'platform')]);assert.equal(concurrent[0].status,202);assert([200,409].includes(concurrent[1].status));row=(await query('SELECT * FROM pos_diagnostic_reports WHERE id=$1',[row.id])).rows[0];assert.equal(row.state,'open');assert.equal(Number(row.occurrences),2);
 }
 console.log('POS admin reports passed: strict technical payloads, active session and tenant scope, platform-only review, idempotent counting, stale-revision denial, reopen, rate limits, retention'+(postgres?', real PostgreSQL duplicate/report-resolution races.':'.'));
}finally{await close();}
