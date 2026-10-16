import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {createAdminAuditExport} from '../admin-audit-export.js';

const db=new PGlite();
try{
 await db.exec(`CREATE TABLE users(id uuid PRIMARY KEY,company_id uuid,email text,role text,status text,must_change_password boolean DEFAULT false);
  CREATE TABLE sessions(user_id uuid,token_hash text,expires_at timestamptz);
  CREATE TABLE audit_log(id bigserial PRIMARY KEY,company_id uuid,actor_user_id uuid,created_at timestamptz,event_type text,entity_type text,entity_id uuid);`);
 const company=crypto.randomUUID(),other=crypto.randomUUID(),owner=crypto.randomUUID();
 await db.query("INSERT INTO users(id,company_id,email,role,status) VALUES($1,$2,$3,'owner','active')",[owner,company,' \t=untrusted']);
 await db.query("INSERT INTO sessions VALUES($1,$2,now()+interval '1 day')",[owner,crypto.createHash('sha256').update('fixture').digest('hex')]);
 const handler=createAdminAuditExport({query:async(...args)=>{const r=await db.query(...args);return {...r,rowCount:r.rows.length};}});
 async function http(from,to=from){let status,body;await handler({url:'/api/v1/admin/audit/export?from='+from+'&to='+to,method:'GET',headers:{authorization:'Bearer fixture'}},{writeHead(code){status=code},end(raw){body=raw}});return {status,body};}
 for(const [day,start,end] of [
  ['2026-10-16','2026-10-15T22:00:00Z','2026-10-16T22:00:00Z'],
  ['2026-03-29','2026-03-28T23:00:00Z','2026-03-29T22:00:00Z'],
  ['2026-10-25','2026-10-24T22:00:00Z','2026-10-25T23:00:00Z']
 ]){
  for(const [label,time,cid] of [
   ['before',new Date(Date.parse(start)-1).toISOString(),company],['start',start,company],
   ['last',new Date(Date.parse(end)-1).toISOString(),company],['after',end,company],['foreign',start,other]
  ])await db.query("INSERT INTO audit_log(company_id,actor_user_id,created_at,event_type,entity_type) VALUES($1,$2,$3,$4,'fixture')",[cid,owner,time,day+'-'+label]);
  const result=await http(day);assert.equal(result.status,200);
  assert.match(result.body,new RegExp(day+'-start'));assert.match(result.body,new RegExp(day+'-last'));
  for(const label of ['before','after','foreign'])assert.equal(result.body.includes(day+'-'+label),false);
  assert.equal(result.body.includes('"\' \t=untrusted"'),true);
 }
 for(const date of ['2026-02-30','0000-01-01','not-a-date'])assert.equal((await http(date)).status,400);
 assert.equal((await http('2026-10-17','2026-10-16')).status,400);
 await db.query('UPDATE users SET must_change_password=true WHERE id=$1',[owner]);
 assert.equal((await http('2026-10-16')).status,403);
 await db.query('UPDATE users SET must_change_password=false WHERE id=$1',[owner]);
 await db.query("INSERT INTO audit_log(company_id,created_at,event_type) SELECT $1,'2026-04-01T12:00:00Z','bulk' FROM generate_series(1,10001)",[company]);
 const oversized=await http('2026-04-01');assert.equal(oversized.status,413);assert.equal(oversized.body.startsWith('\uFEFF'),false);
 console.log('Admin audit passed: Berlin midnight, 23/25-hour DST days, tenant scope, password gate, CSV formula protection and oversized-export refusal.');
}finally{await db.close();}
