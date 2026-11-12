import {migrateTransactionalMail} from '../transactional-mail.js';
import assert from 'node:assert/strict';import crypto from 'node:crypto';import fs from 'node:fs';import {Readable} from 'node:stream';import pg from 'pg';import {PGlite} from '@electric-sql/pglite';
import {migrateRosterAuto,createRosterAuto,createRosterProposalWorker} from '../roster-auto.js';import {migrateDutyPlanning,replanDuty} from '../duty-planning.js';import {nextMonday,addDays,zonedInstant} from '../roster-auto-core.js';
const connectionString=process.env.ROSTER_TEST_DATABASE_URL,id=()=>crypto.randomUUID(),sha=x=>crypto.createHash('sha256').update(x).digest('hex'),schema='roster_'+crypto.randomBytes(8).toString('hex');let admin,db;
if(connectionString){const u=new URL(connectionString);assert(['localhost','127.0.0.1'].includes(u.hostname)&&u.pathname==='/bringness_device_test');admin=new pg.Pool({connectionString});await admin.query('CREATE SCHEMA '+schema);db=new pg.Pool({connectionString,max:5,options:'-c search_path='+schema+' -c statement_timeout=10000'});}else{db=new PGlite();await db.waitReady;}
const query=async(sql,args)=>{if(args===undefined&&sql.includes(';')){await(connectionString?db.query(sql):db.exec(sql));return {rows:[],rowCount:0};}const r=await db.query(sql,args);return {...r,rowCount:r.rowCount??r.affectedRows??r.rows.length};};
let failEvent=false;const wrap=c=>({query:async(sql,args)=>{if(failEvent&&sql.startsWith('INSERT INTO roster_auto_events')){failEvent=false;throw Object.assign(Error('Synthetic audit outage'),{code:'TEST_ROSTER_AUDIT'});}return c.query(sql,args);},release:()=>c.release()});
const pool={query,connect:async()=>wrap(connectionString?await db.connect():{query,release(){}})},handler=createRosterAuto(pool);
async function call(body,token='owner',method='POST',extra='',pin='pin-'+token){
 const req=Readable.from(method==='POST'?[JSON.stringify(body)]:[]);Object.assign(req,{method,url:'/api/v1/roster-auto'+(method==='GET'?'?restaurantId='+body.restaurantId+'&week='+body.week+extra:''),headers:{authorization:'Bearer '+token,'x-personnel-unlock':pin}});let status,result;assert(await handler(req,{writeHead(s,h){status=s;assert.equal(h['cache-control'],'no-store');},end(raw){result=JSON.parse(raw)}}));return {status,...result};
}
try{
 let foundation=fs.readFileSync(new URL('../../db/schema.sql',import.meta.url),'utf8').replace('CREATE EXTENSION IF NOT EXISTS pgcrypto;','');await query(foundation);
 await query(`ALTER TABLE users ADD COLUMN role text DEFAULT 'owner',ADD COLUMN must_change_password boolean DEFAULT false;
 ALTER TABLE employees ADD COLUMN user_id uuid REFERENCES users(id),ADD COLUMN duty_state text DEFAULT 'off';
 CREATE TABLE sessions(token_hash text PRIMARY KEY,user_id uuid REFERENCES users(id),expires_at timestamptz);
 CREATE TABLE personnel_unlocks(token_hash text PRIMARY KEY,session_hash text,user_id uuid REFERENCES users(id),expires_at timestamptz);
 CREATE TABLE company_features(company_id uuid,feature_code text,status text,ends_at timestamptz,grace_until timestamptz);
 CREATE TABLE waiter_schedules(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),employee_id uuid NOT NULL REFERENCES employees(id),restaurant_id uuid NOT NULL REFERENCES restaurants(id),starts_at timestamptz NOT NULL,ends_at timestamptz NOT NULL,note text,recurrence text);`);
 await migrateTransactionalMail(pool);await migrateDutyPlanning(pool);await migrateRosterAuto(pool);await migrateRosterAuto(pool);
 const company=id(),otherCompany=id(),restaurant=id(),foreignRestaurant=id(),owner=id(),staffUser=id(),otherOwner=id(),a=id(),b=id(),cook=id(),need=id();
 await query("INSERT INTO companies(id,name) VALUES($1,'Synthetic roster company'),($2,'Other company')",[company,otherCompany]);await query("INSERT INTO restaurants(id,company_id,name) VALUES($1,$2,'Synthetic restaurant'),($3,$4,'Other restaurant')",[restaurant,company,foreignRestaurant,otherCompany]);
 for(const [uid,cid,role,email]of [[owner,company,'owner','owner@example.test'],[staffUser,company,'waiter','staff@example.test'],[otherOwner,otherCompany,'owner','other@example.test']])await query('INSERT INTO users(id,company_id,email,password_hash,display_name,role) VALUES($1,$2,$3,\'synthetic\',\'Synthetic user\',$4)',[uid,cid,email,role]);
 for(const [uid,token]of [[owner,'owner'],[staffUser,'waiter'],[otherOwner,'other']])await query("INSERT INTO sessions VALUES($1,$2,now()+interval '1 day')",[sha(token),uid]);
 for(const [uid,token]of [[owner,'owner'],[otherOwner,'other']])await query("INSERT INTO personnel_unlocks VALUES($1,$2,$3,now()+interval '3 minutes')",[sha('pin-'+token),sha(token),uid]);
 for(const cid of [company,otherCompany])await query("INSERT INTO company_features VALUES($1,'personnel','active',NULL,NULL)",[cid]);
 await query("INSERT INTO employees(id,restaurant_id,display_name,role,user_id) VALUES($1,$2,'A','waiter',$3),($4,$2,'B','waiter',NULL),($5,$2,'Cook','cook',NULL)",[a,restaurant,staffUser,b,cook]);
 const week=nextMonday(Date.now(),'Europe/Berlin'),week2=addDays(week,7),base={restaurantId:restaurant,week};let serial=0;
 const command=(action,fields={})=>({...base,requestId:id(),action,...fields}),read=(period=week,token='owner',rid=restaurant)=>call({restaurantId:rid,week:period},token,'GET');
 assert.equal((await read(week,'bad')).status,401);assert.equal((await read(week,'waiter')).status,403);assert.equal((await read(week,'other')).status,404);
 assert.equal((await call(base,'owner','GET','','')).status,403);assert.equal((await call(base,'owner','GET','','wrong')).status,403);
 let state=await read();assert.equal(state.status,200);assert.equal(state.version,0);assert.equal(state.policy.enabled,false);assert.equal(state.drafts.length,0);
 const policy={enabled:true,timezone:'Europe/Berlin',needs:[{id:need,weekday:1,start:'09:00',end:'17:00',role:'waiter',count:1,skills:['barista']}],profiles:[a,b].map(employeeId=>({employeeId,enabled:true,skills:['barista'],windows:[{weekday:1,start:'08:00',end:'18:00'}]}))};
 const settingsCommand=command('settings',{version:0,policy});let result=await call(settingsCommand);assert.equal(result.status,200,JSON.stringify(result));assert.equal(result.version,1);
 assert.equal((await query('SELECT * FROM waiter_schedules')).rowCount,0,'unapproved proposal cannot appear in waiter schedules');state=await read();let draft=state.drafts.find(d=>d.state==='draft');assert(draft);assert.equal(draft.payload.slots.length,1);assert.equal(draft.payload.openCount,0);
 const replay=await call(settingsCommand);assert.equal(replay.replayed,true);assert.equal((await call({...settingsCommand,policy:{...policy,enabled:false}})).status,409);
 const firstEmployee=draft.payload.slots[0].employeeId;assert([a,b].includes(firstEmployee));const second=firstEmployee===a?b:a;
 const publishCommand=command('publish',{draftId:draft.id,revision:draft.revision,acceptOpen:false});
 // Any employee status/absence/context change must invalidate a reviewed proposal.
 await query("INSERT INTO staff_absences(employee_id,restaurant_id,kind,state,starts_at,ends_at) VALUES($1,$2,'vacation','approved',$3,$4)",[firstEmployee,restaurant,zonedInstant(week,'00:00','Europe/Berlin'),zonedInstant(addDays(week,1),'00:00','Europe/Berlin')]);assert.equal((await call(publishCommand)).status,409);
 result=await call(command('generate',{version:state.version,revision:draft.revision}));assert.equal(result.status,200,JSON.stringify(result));draft=result.draft;assert.equal(draft.payload.slots[0].employeeId,second);
 const editDraft=command('draft-slot',{draftId:draft.id,revision:draft.revision,key:draft.payload.slots[0].key,employeeId:second,date:week,start:'10:00',endDate:week,end:'16:00',repeat:'weekly'});
 result=await call(editDraft);assert.equal(result.status,200,JSON.stringify(result));state=await read();draft=state.drafts.find(d=>d.state==='draft');assert.equal(draft.payload.slots[0].manual,true);assert.equal(state.patterns.length,1);
 // Regeneration keeps explicit manual choices and does not add a duplicate of the same pattern.
 result=await call(command('generate',{version:state.version,revision:draft.revision}));assert.equal(result.status,200,JSON.stringify(result));draft=result.draft;assert(draft.payload.slots.some(s=>s.edited&&s.employeeId===second&&s.startsAt===zonedInstant(week,'10:00','Europe/Berlin')));
 // The original09:00-17:00 demand is now separately visible because the operator shortened the fixed shift.
 for(const slot of [...draft.payload.slots].filter(s=>!s.edited)){
  const pp=slot.startsAt;result=await call(command('draft-slot',{draftId:draft.id,revision:draft.revision,key:slot.key,employeeId:null,date:week,start:'09:00',endDate:week,end:'17:00',repeat:'once'}));assert.equal(result.status,200,JSON.stringify(result));state=await read();draft=state.drafts.find(d=>d.state==='draft');
 }
 assert.equal((await call(command('publish',{draftId:draft.id,revision:draft.revision,acceptOpen:false}))).status,400);
 const approve=command('publish',{draftId:draft.id,revision:draft.revision,acceptOpen:true});
 failEvent=true;assert.equal((await call(approve)).status,500);assert.equal((await query('SELECT * FROM waiter_schedules')).rowCount,0,'failed audit rolls back publication');
 result=await call(approve);assert.equal(result.status,200,JSON.stringify(result));assert.equal(result.published,1);assert.equal(result.open,1);assert.equal((await call(approve)).replayed,true);assert.equal((await query('SELECT * FROM waiter_schedules')).rowCount,1);
 let published=(await query('SELECT * FROM waiter_schedules')).rows[0];assert.equal(published.employee_id,second);assert.equal(published.manual_lock,true);
 const change=command('edit-shift',{scheduleId:published.id,revision:published.planner_revision,employeeId:second,date:week,start:'11:00',endDate:week,end:'16:00',repeat:'once',note:'Nur diesmal später'});result=await call(change);assert.equal(result.status,200,JSON.stringify(result));published=(await query('SELECT * FROM waiter_schedules')).rows[0];assert.equal(published.planner_origin,'manual');assert.equal(published.planner_revision,2);
 assert.equal((await call({...change,requestId:id()})).status,409);assert.equal((await call({...change,requestId:id()},'other')).status,404);
 // A protected manual shift becomes an open conflict when the employee is absent,
 // but the old automatic replacement routine must not overwrite the owner choice.
 await query("UPDATE staff_absences SET state='ended' WHERE employee_id=$1",[firstEmployee]);await query('UPDATE employees SET roster_available=true');
 await query("INSERT INTO staff_absences(employee_id,restaurant_id,kind,state,starts_at,ends_at) VALUES($1,$2,'sick','approved',$3,$4)",[second,restaurant,zonedInstant(week,'00:00','Europe/Berlin'),zonedInstant(addDays(week,1),'00:00','Europe/Berlin')]);
 await replanDuty(pool,restaurant);let row=(await query('SELECT * FROM waiter_schedules')).rows[0];assert.equal(row.employee_id,second);assert.equal(row.coverage_state,'open');
 const worker=createRosterProposalWorker(pool);await worker();await worker();assert.equal((await query("SELECT * FROM roster_auto_drafts WHERE week=$1 AND state='draft'",[week2])).rowCount,1);assert.equal((await query('SELECT * FROM waiter_schedules')).rowCount,1,'worker only drafts');
 state=await read(week2);draft=state.drafts.find(d=>d.state==='draft');assert(draft.payload.slots.some(s=>s.patternId&&s.startsAt===zonedInstant(week2,'10:00','Europe/Berlin')),'one-off edit must not change future weekly pattern');
 // A future weekly change starts on its explicit date, preserving intervening weeks.
 const thirdWeek=addDays(week,14);state=await read(thirdWeek);result=await call(command('generate',{week:thirdWeek,version:state.version,revision:0}));assert.equal(result.status,200,JSON.stringify(result));draft=result.draft;const fixed=draft.payload.slots.find(s=>s.patternId);assert(fixed);
 result=await call(command('draft-slot',{week:thirdWeek,draftId:draft.id,revision:draft.revision,key:fixed.key,employeeId:second,date:thirdWeek,start:'12:00',endDate:thirdWeek,end:'16:00',repeat:'weekly'}));assert.equal(result.status,200,JSON.stringify(result));
 state=await read(week2);draft=state.drafts.find(d=>d.state==='draft');result=await call(command('generate',{week:week2,version:state.version,revision:draft.revision}));assert.equal(result.status,200,JSON.stringify(result));assert(result.draft.payload.slots.some(s=>s.patternId&&s.startsAt===zonedInstant(week2,'10:00','Europe/Berlin')));
 const fourth=addDays(week,21);state=await read(fourth);result=await call(command('generate',{week:fourth,version:state.version,revision:0}));assert.equal(result.status,200,JSON.stringify(result));assert(result.draft.payload.slots.some(s=>s.patternId&&s.startsAt===zonedInstant(fourth,'12:00','Europe/Berlin')));
 if(connectionString){
  // Independent connections racing to publish the exact reviewed draft commit once.
  state=await read(fourth);draft=state.drafts.find(d=>d.state==='draft');const publish=command('publish',{week:fourth,draftId:draft.id,revision:draft.revision,acceptOpen:true}),beforeCount=(await query('SELECT * FROM waiter_schedules')).rowCount;
  const results=await Promise.all([call(publish),call(publish)]);assert(results.every(r=>r.status===200),JSON.stringify(results));assert.equal(results.filter(r=>r.replayed).length,1);assert.equal((await query('SELECT * FROM waiter_schedules')).rowCount,beforeCount+results[0].published);
  // A settings write committed while approval waits on the restaurant lock invalidates approval.
  state=await read(week2);draft=state.drafts.find(d=>d.state==='draft');const blocker=await db.connect();await blocker.query('BEGIN');await blocker.query('SELECT id FROM restaurants WHERE id=$1 FOR UPDATE',[restaurant]);
  const waiting=call(command('publish',{week:week2,draftId:draft.id,revision:draft.revision,acceptOpen:true}));await blocker.query('UPDATE roster_auto_settings SET version=version+1 WHERE restaurant_id=$1',[restaurant]);await blocker.query('COMMIT');blocker.release();const changed=await waiting;assert.equal(changed.status,409,JSON.stringify(changed));assert.equal((await query('SELECT * FROM waiter_schedules')).rowCount,beforeCount+results[0].published);

 }
 // Full automatic mode is explicit. A newcomer fills a previously open need, with mail and exact retry.
 const autoRestaurant=id(),newcomer=id(),newUser=id(),autoNeed=id();await query("INSERT INTO restaurants(id,company_id,name) VALUES($1,$2,'Automatic fixture')",[autoRestaurant,company]);
 const autoPolicy={enabled:true,automaticPublication:true,autoEnroll:true,timezone:'Europe/Berlin',needs:[{id:autoNeed,weekday:1,start:'09:00',end:'13:00',role:'waiter',count:1,skills:[]}],profiles:[]};
 await query('INSERT INTO roster_auto_settings(company_id,restaurant_id,policy) VALUES($1,$2,$3)',[company,autoRestaurant,JSON.stringify(autoPolicy)]);await worker();assert.equal((await query('SELECT * FROM waiter_schedules WHERE restaurant_id=$1',[autoRestaurant])).rowCount,0,'unfilled requirement never invents a worker');
 await query("INSERT INTO users(id,company_id,email,password_hash,display_name,role) VALUES($1,$2,'new@example.test','fixture','New','waiter')",[newUser,company]);await query("INSERT INTO employees(id,restaurant_id,display_name,role,user_id) VALUES($1,$2,'New','waiter',$3)",[newcomer,autoRestaurant,newUser]);
 await worker();let automaticRows=(await query('SELECT * FROM waiter_schedules WHERE restaurant_id=$1',[autoRestaurant])).rows;assert(automaticRows.length>=2,'new active employee automatically fills future weeks');assert(automaticRows.every(s=>s.employee_id===newcomer));assert.equal((await query("SELECT * FROM transactional_mail WHERE dedupe_key LIKE 'roster-schedule:%' AND recipient='new@example.test'")).rowCount,automaticRows.length);
 const beforeAutomatic=automaticRows.length;await worker();assert.equal((await query('SELECT * FROM waiter_schedules WHERE restaurant_id=$1',[autoRestaurant])).rowCount,beforeAutomatic,'worker retry cannot duplicate shifts');
 // One unfilled position must not suppress otherwise valid assignments; gaps remain as a draft.
 const partialRestaurant=id(),partialEmployee=id(),partialNeed=id();await query("INSERT INTO restaurants(id,company_id,name) VALUES($1,$2,'Partial fixture')",[partialRestaurant,company]);await query("INSERT INTO employees(id,restaurant_id,display_name,role) VALUES($1,$2,'Only available employee','waiter')",[partialEmployee,partialRestaurant]);
 await query('INSERT INTO roster_auto_settings(company_id,restaurant_id,policy) VALUES($1,$2,$3)',[company,partialRestaurant,JSON.stringify({...autoPolicy,needs:[{...autoPolicy.needs[0],id:partialNeed,count:2}]})]);await worker();const partialCount=(await query('SELECT * FROM waiter_schedules WHERE restaurant_id=$1',[partialRestaurant])).rowCount;assert(partialCount>=2,'available employee gets assigned despite remaining gap');assert((await query("SELECT * FROM roster_auto_drafts WHERE restaurant_id=$1 AND state='draft'",[partialRestaurant])).rows.filter(d=>d.payload.slots.length).every(d=>d.payload.openCount>0),'remaining gaps stay visible');await worker();assert.equal((await query('SELECT * FROM waiter_schedules WHERE restaurant_id=$1',[partialRestaurant])).rowCount,partialCount,'partial publication retries do not duplicate assignments');
 const protectedRow=automaticRows[0];await query("UPDATE waiter_schedules SET note='Owner fixed morning',manual_lock=true,planner_origin='manual' WHERE id=$1",[protectedRow.id]);await worker();assert.equal((await query('SELECT note FROM waiter_schedules WHERE id=$1',[protectedRow.id])).rows[0].note,'Owner fixed morning');
 // Administrative unlock remains bound to the current login and expires independently.
 await query("UPDATE personnel_unlocks SET expires_at=now()-interval '1 second' WHERE user_id=$1",[owner]);assert.equal((await read()).status,403);assert.equal((await call(command('generate',{version:0,revision:0}))).status,403);await query("UPDATE personnel_unlocks SET expires_at=now()+interval '3 minutes' WHERE user_id=$1",[owner]);
 assert.equal((await call(base,'owner','GET','','pin-other')).status,403);
 await assert.rejects(query("UPDATE roster_auto_events SET action='tampered'"),/unverändert/);await assert.rejects(query('TRUNCATE roster_auto_events'),/unverändert/);
 await query("UPDATE company_features SET status='inactive' WHERE company_id=$1",[company]);assert.equal((await read()).status,402);
 console.log('Automatic roster '+(connectionString?'PostgreSQL':'PGlite')+' passed: actual foundation, draft-only worker, owner/tenant/module scope, context invalidation, protected one-off/weekly choices, open-shift acknowledgement, audit rollback, replay and immutable events.');
}finally{if(connectionString){await db.end();await admin.query('DROP SCHEMA '+schema+' CASCADE');await admin.end();}else await db.close();}
