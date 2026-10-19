import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {Readable} from 'node:stream';
import pg from 'pg';
import {migrateCashClosing,createCashClosing} from '../cash-closing.js';
const postgresUrl=process.env.CASH_TEST_DATABASE_URL;let db,admin,schema;
if(postgresUrl){const u=new URL(postgresUrl);assert(['localhost','127.0.0.1'].includes(u.hostname)&&u.pathname==='/bringness_device_test');schema='cash_'+crypto.randomBytes(8).toString('hex');admin=new pg.Pool({connectionString:postgresUrl});await admin.query('CREATE SCHEMA '+schema);db=new pg.Pool({connectionString:postgresUrl,options:'-c search_path='+schema});db.exec=s=>db.query(s);db.close=()=>db.end();}else{db=new PGlite();await db.waitReady;}
await db.exec('CREATE TABLE restaurants(id uuid PRIMARY KEY,company_id uuid);CREATE TABLE users(id uuid PRIMARY KEY);CREATE TABLE orders(id uuid PRIMARY KEY,restaurant_id uuid);CREATE TABLE payments(id uuid PRIMARY KEY,order_id uuid,method text,amount_cents int);CREATE TABLE pos_trade_sales(order_id uuid PRIMARY KEY);');
const query=async(s,a)=>a===undefined&&s.includes(';')?(await db.exec(s),{rows:[]}):db.query(s,a);
const pool={query,connect:async()=>postgresUrl?db.connect():({query,release(){}})};
const rid=crypto.randomUUID(),company=crypto.randomUUID(),uid=crypto.randomUUID(),foreign=crypto.randomUUID();
await query('INSERT INTO restaurants VALUES($1,$2)',[rid,company]);await query('INSERT INTO users VALUES($1)',[uid]);await migrateCashClosing(pool);await migrateCashClosing(pool);
let role='owner';const handler=createCashClosing(pool,async()=>({id:uid,company_id:company,role}));
async function call(body,method='POST'){const req=Readable.from(body?[JSON.stringify(body)]:[]);req.url='/api/v1/cash-sessions'+(method==='GET'?'?restaurantId='+rid:'');req.method=method;req.headers={};let status,result;await handler(req,{writeHead(s){status=s;},end(s){result=JSON.parse(s);}});return {status,body:result};}
const draft=(action,amountCents,sessionId,reason='')=>({restaurantId:rid,requestKey:crypto.randomUUID(),action,amountCents,sessionId,reason});
try{
const open=draft('open',1000);const opened=await call(open);assert.equal(opened.status,200);const sid=opened.body.session.id;assert.equal((await call(open)).body.session.id,sid);assert.equal((await call(draft('open',0))).status,409);
role='waiter';assert.equal((await call(null,'GET')).status,403);role='owner';assert.equal((await call({...draft('open',0),restaurantId:foreign})).status,404);
for(const [mode,method,amount] of [['retail','cash',100],['trade','cash',300],['trade','card',900]]){const oid=crypto.randomUUID();await query('INSERT INTO orders VALUES($1,$2)',[oid,rid]);if(mode==='trade')await query('INSERT INTO pos_trade_sales VALUES($1)',[oid]);await query('INSERT INTO payments VALUES($1,$2,$3,$4)',[crypto.randomUUID(),oid,method,amount]);}
const dep=draft('deposit',200,sid,'Wechselgeld');assert.equal((await call(dep)).status,200);await call(dep);assert.equal((await call({...dep,amountCents:201})).status,409);
assert.equal((await call(draft('withdraw',2000,sid,'Bank'))).status,409);
assert.equal((await call(draft('withdraw',100,sid,'Bank'))).status,200);
const active=(await call(null,'GET')).body.sessions[0];assert.equal(active.expectedCents,1500);assert.equal(active.payments.length,3);assert.equal(active.movements.length,2);
assert.equal((await call(draft('close',1400,sid))).status,400);const close=draft('close',1400,sid,'Zähldifferenz');const closed=await call(close);assert.equal(closed.status,200);assert.equal(closed.body.session.differenceCents,-100);assert.deepEqual((await call(close)).body,closed.body);
assert.equal((await call(draft('deposit',100,sid,'Zu spät'))).status,409);
if(postgresUrl){const starts=await Promise.all(Array.from({length:5},()=>call(draft('open',0))));assert.equal(starts.filter(r=>r.status===200).length,1);assert.equal(starts.filter(r=>r.status===409).length,4);}else await call(draft('open',0));const report=(await call(null,'GET')).body.sessions.find(s=>s.id===sid);assert.ok(report.closed_at);assert.equal(report.expectedCents,1500);assert.equal(report.differenceCents,-100);
console.log('Cash closing database tests passed: scopes, permissions, replay, payment capture, reports, immutable closure.');
}finally{await db.close();if(admin){await admin.query('DROP SCHEMA '+schema+' CASCADE');await admin.end();}}
