import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {Readable} from 'node:stream';
import {PGlite} from '@electric-sql/pglite';
import pg from 'pg';
import {accountantHandler,migrateAccountantAccess} from '../accountant-access.js';
import {migrateCashClosing} from '../cash-closing.js';
const uuid=()=>crypto.randomUUID(),hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const connectionString=process.env.ACCOUNTANT_TEST_DATABASE_URL;let db,local,admin,schema;
if(connectionString){
 const url=new URL(connectionString);assert(['localhost','127.0.0.1'].includes(url.hostname)&&url.pathname==='/bringness_device_test');
 schema='accountant_access_'+crypto.randomBytes(8).toString('hex');admin=new pg.Pool({connectionString});await admin.query('CREATE SCHEMA '+schema);
 db=new pg.Pool({connectionString,options:'-c search_path='+schema+' -c statement_timeout=10000'});
}else{
 local=new PGlite();await local.waitReady;
 const query=async(sql,args)=>{if(args===undefined&&sql.includes(';')){await local.exec(sql);return {rows:[],rowCount:0}}const r=await local.query(sql,args);return {...r,rowCount:r.affectedRows||r.rows.length}};
 db={query,connect:async()=>({query,release(){}})};
}
try{
 await db.query((await readFile(new URL('../../db/schema.sql',import.meta.url),'utf8')).replace('CREATE EXTENSION IF NOT EXISTS pgcrypto;',''));
 await db.query("ALTER TABLE users ADD COLUMN role text DEFAULT 'owner';ALTER TABLE users ADD COLUMN must_change_password boolean DEFAULT false;CREATE TABLE sessions(token_hash text,user_id uuid,expires_at timestamptz);ALTER TABLE receipts ADD COLUMN merchant_snapshot jsonb;");
 await migrateAccountantAccess(db);await migrateCashClosing(db);await migrateAccountantAccess(db);
 const company=uuid(),foreign=uuid(),restaurant=uuid(),otherRestaurant=uuid(),owner=uuid(),token=uuid(),foreignOwner=uuid(),foreignToken=uuid();
 for(const id of [company,foreign])await db.query("INSERT INTO companies(id,name) VALUES($1,'Synthetic accountant fixture')",[id]);
 for(const [id,cid] of [[restaurant,company],[otherRestaurant,foreign]])await db.query("INSERT INTO restaurants(id,company_id,name) VALUES($1,$2,'Fixture')",[id,cid]);
 for(const [id,cid,t] of [[owner,company,token],[foreignOwner,foreign,foreignToken]]){
  await db.query("INSERT INTO users(id,company_id,email,password_hash,display_name) VALUES($1,$2,$3,'fixture','Owner')",[id,cid,id+'@example.test']);
  await db.query("INSERT INTO sessions VALUES($1,$2,now()+interval '1 hour')",[hash(t),id]);
 }
 const call=async(path,{auth=token,method='GET',body,handler=accountantHandler(db)}={})=>{
  const req=Readable.from(body?[JSON.stringify(body)]:[]);Object.assign(req,{url:'/api/v1/accountant/'+path,method,headers:{authorization:'Bearer '+auth}});let status,data,headers;
  await handler(req,{writeHead(s,h){status=s;headers=h},end(raw){data=JSON.parse(raw)}});assert.equal(headers['cache-control'],'no-store');return {status,data};
 };
 const body={restaurantId:restaurant,from:'2000-01-01',to:'2100-12-31',days:7,label:'Synthetic accounting office'};
 const grant=await call('grants',{method:'POST',body});assert.equal(grant.status,201);const auth=grant.data.token;
 const report={expectedCents:12000,countedCents:11975,differenceCents:-25,reason:' @formula',payments:[{method:'cash',mode:'retail',amount_cents:2000}],deposit:{chargedCents:25,returnedCents:0},movements:[{id:uuid(),action:'deposit',amount_cents:1000,reason:'Fixture deposit',created_at:'2026-01-15T10:00:00Z',created_by:owner}],closedBy:owner,privateMarker:'excluded'};
 const insert=async(rid,closedAt,r=report)=>{const id=uuid();await db.query('INSERT INTO pos_cash_sessions(id,restaurant_id,opening_cents,opened_by,opened_at,closed_at,report) VALUES($1,$2,9000,$3,$4,$5,$6)',[id,rid,owner,'2026-01-14T12:00:00Z',closedAt,r]);return id};
 for(let i=0;i<205;i++)await insert(restaurant,'2026-01-15T10:11:12.123'+String(i%1000).padStart(3,'0')+'Z');
 const foreignId=await insert(otherRestaurant,'2026-01-15T11:00:00Z');
 const openId=await insert(restaurant,null,null);
 const first=await call('cash-closings',{auth});assert.equal(first.status,200);assert.equal(first.data.closings.length,100);assert.equal(first.data.officialDsfinvk,false);
 const late=await insert(restaurant,new Date().toISOString());
 let all=[...first.data.closings],cursor=first.data.nextCursor,pages=1;
 while(cursor){const page=await call('cash-closings?cursor='+encodeURIComponent(cursor),{auth});assert.equal(page.status,200);assert.equal(page.data.asOf,first.data.asOf);all.push(...page.data.closings);cursor=page.data.nextCursor;assert(++pages<=4)}
 assert.equal(all.length,205);assert.equal(new Set(all.map(x=>x.id)).size,205);assert(!all.some(x=>[foreignId,openId,late].includes(x.id)));assert.equal(all[0].differenceCents,-25);
 const serialized=JSON.stringify(all);assert(!serialized.includes('closedBy'));assert(!serialized.includes('created_by'));assert(!serialized.includes('privateMarker'));assert(!serialized.includes(auth));
 assert.equal((await call('receipts?cursor='+encodeURIComponent(first.data.nextCursor),{auth})).status,400);
 assert.equal((await call('cash-closings?from=1999-01-01',{auth})).status,403);
 assert.equal((await call('cash-closings?restaurantId='+otherRestaurant,{auth})).status,403);
 assert.equal((await call('cash-closings?x=1',{auth})).status,400);
 assert.equal((await call('cash-closings?cursor=x&cursor=y',{auth})).status,400);
 assert.equal((await call('cash-closings',{auth,method:'POST',body:{}})).status,405);
 assert.equal((await call('grants',{auth,method:'POST',body})).status,401);
 assert.equal((await call('cash-closings?'+new URLSearchParams({restaurantId:restaurant,from:body.from,to:body.to}),{auth:foreignToken})).status,403);
 // Inclusive Berlin calendar dates, including the UTC day before the start.
 const boundaryGrant=await call('grants',{method:'POST',body:{...body,from:'2026-01-16',to:'2026-01-16'}});
 const before=await insert(restaurant,'2026-01-15T22:59:59.999999Z'),start=await insert(restaurant,'2026-01-15T23:00:00Z'),end=await insert(restaurant,'2026-01-16T22:59:59.999999Z'),after=await insert(restaurant,'2026-01-16T23:00:00Z');
 const boundary=await call('cash-closings',{auth:boundaryGrant.data.token});assert.deepEqual(new Set(boundary.data.closings.map(x=>x.id)),new Set([start,end]));
 assert(!boundary.data.closings.some(x=>x.id===before||x.id===after));
 // Revalidate the actual session after the initial role lookup, before a write or read.
 const staleDb={query:(...args)=>db.query(...args),connect:async()=>{await db.query('DELETE FROM sessions WHERE token_hash=$1',[hash(token)]);return db.connect()}};
 for(const path of ['grants','cash-closings?'+new URLSearchParams({restaurantId:restaurant,from:body.from,to:body.to})]){
  const response=await call(path,{...(path==='grants'?{method:'POST',body}:{}),handler:accountantHandler(staleDb)});assert.equal(response.status,401);
  await db.query("INSERT INTO sessions VALUES($1,$2,now()+interval '1 hour')",[hash(token),owner]);
 }
 // Expired and revoked grants cannot open new pages, even with a formerly valid cursor.
 await db.query("UPDATE accountant_grants SET expires_at=now()-interval '1 second' WHERE id=$1",[boundaryGrant.data.id]);assert.equal((await call('cash-closings',{auth:boundaryGrant.data.token})).status,401);
 if(connectionString){
  const blocker=await db.connect();await blocker.query('BEGIN');await blocker.query('SELECT id FROM accountant_grants WHERE id=$1 FOR UPDATE',[grant.data.id]);
  let arrived;const waiting=new Promise(resolve=>{arrived=resolve});
  const lockedPool={query:(...a)=>db.query(...a),connect:async()=>{const c=await db.connect();return {query:(sql,args)=>{if(sql.includes('FROM accountant_grants')&&sql.includes('FOR SHARE'))arrived();return c.query(sql,args)},release:()=>c.release()}}};
  const pending=call('cash-closings',{auth,handler:accountantHandler(lockedPool)});await waiting;
  await blocker.query('UPDATE accountant_grants SET revoked_at=clock_timestamp() WHERE id=$1',[grant.data.id]);await blocker.query('COMMIT');blocker.release();assert.equal((await pending).status,401);
 }else{assert.equal((await call('revoke',{method:'POST',body:{id:grant.data.id}})).status,200)}
 assert.equal((await call('cash-closings?cursor='+encodeURIComponent(first.data.nextCursor),{auth})).status,401);
 assert.equal((await db.query('SELECT count(*)::int n FROM orders')).rows[0].n,0);assert.equal((await db.query('SELECT count(*)::int n FROM payments')).rows[0].n,0);
 console.log((connectionString?'PostgreSQL':'PGlite')+' accountant access passed: 205 paginated immutable closings, Berlin date boundaries, role/tenant/session/expiry/revocation limits, sanitized reports and no financial writes.');
}finally{
 if(local)await local.close();else{await db.end();await admin.query('DROP SCHEMA '+schema+' CASCADE');await admin.end()}
}
