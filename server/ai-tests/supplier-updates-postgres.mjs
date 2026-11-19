import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import pg from 'pg';
import {fulfilmentRoutes} from '../ai-fulfilment.js';
import {authorizeSupplierConnector} from '../ai-supplier-actions.js';
import {hash} from '../ai-policy.js';
const connectionString=process.env.SUPPLIER_UPDATE_TEST_DATABASE_URL;
if(!connectionString)throw Error('Dedicated PostgreSQL supplier update test required');
const url=new URL(connectionString);assert(['localhost','127.0.0.1'].includes(url.hostname)&&url.pathname==='/bringness_device_test');
const schema='supplier_updates_'+crypto.randomBytes(8).toString('hex'),admin=new pg.Pool({connectionString});await admin.query('CREATE SCHEMA '+schema);
const db=new pg.Pool({connectionString,options:'-c search_path='+schema+' -c statement_timeout=10000'});
const supplier=crypto.randomUUID(),buyer=crypto.randomUUID(),connector=crypto.randomUUID(),product=crypto.randomUUID(),order=crypto.randomUUID(),stock=crypto.randomUUID(),token='synthetic-supplier-key';
const link={id:connector,supplier_id:supplier};let blocker;const clients=[];
async function waitBlocked(pid){for(let i=0;i<300;i++){if((await admin.query('SELECT 1 FROM pg_locks WHERE pid=$1 AND NOT granted',[pid])).rowCount)return;await new Promise(r=>setTimeout(r,10));}throw Error('Expected real PostgreSQL lock wait');}
async function perform(requestId,reason,{beforeAuth,afterAuth}={}){
 return fulfilmentRoutes('/api/ai/fulfilment/unavailable','POST',{requestKey:requestId,confirmed:true,orderId:order,reason,pauseProduct:false,apiConnectorId:connector},{id:supplier,role:'dealer'},null,false,{db,requestId,connectorId:connector,authorize:async c=>{const pid=(await c.query('SELECT pg_backend_pid() pid')).rows[0].pid;clients.push(pid);if(beforeAuth)await beforeAuth(pid);await authorizeSupplierConnector(c,link,token);if(afterAuth)await afterAuth(pid);}});
}
try{
 await db.query(`CREATE TABLE ai_accounts(id uuid PRIMARY KEY,role text,status text);
 CREATE TABLE ai_supplier_connectors(id uuid PRIMARY KEY,supplier_id uuid REFERENCES ai_accounts(id),token_hash text,active boolean);
 CREATE TABLE ai_products(id uuid PRIMARY KEY,supplier_id uuid REFERENCES ai_accounts(id),available boolean);
 CREATE TABLE ai_stock(id uuid PRIMARY KEY,quantity numeric);
 CREATE TABLE ai_orders(id uuid PRIMARY KEY,supplier_id uuid,buyer_id uuid,product_id uuid,stock_id uuid,supplier_order_id uuid,product_name text,packs int,status text,unavailable boolean DEFAULT false,unavailable_reason text DEFAULT '',commission_cents int DEFAULT 20,updated_at timestamptz DEFAULT now());
 CREATE TABLE ai_audit(actor_id uuid,target_id uuid,action text,detail jsonb);
 CREATE TABLE ai_fulfilment_requests(actor_id uuid,request_key uuid,fingerprint text,response jsonb,PRIMARY KEY(actor_id,request_key));
 CREATE TABLE ai_fulfilment_alerts(id uuid DEFAULT gen_random_uuid(),order_id uuid,kind text,note text,detail jsonb,updated_at timestamptz DEFAULT now(),acknowledged_at timestamptz,acknowledged_by uuid,resolved_at timestamptz);
 CREATE UNIQUE INDEX alert_unique ON ai_fulfilment_alerts(order_id,kind) WHERE resolved_at IS NULL;`);
 await db.query("INSERT INTO ai_accounts VALUES($1,'dealer','active'),($2,'restaurant','active')",[supplier,buyer]);
 await db.query('INSERT INTO ai_supplier_connectors VALUES($1,$2,$3,true)',[connector,supplier,hash(token)]);
 await db.query('INSERT INTO ai_products VALUES($1,$2,true)',[product,supplier]);await db.query('INSERT INTO ai_stock VALUES($1,10)',[stock]);
 await db.query("INSERT INTO ai_orders(id,supplier_id,buyer_id,product_id,stock_id,product_name,packs,status) VALUES($1,$2,$3,$4,$5,'Fixture',2,'sent')",[order,supplier,buyer,product,stock]);
 blocker=await db.connect();
 // Two real sessions wait behind the same actor lock, then replay one durable result.
 await blocker.query('BEGIN');await blocker.query('SELECT id FROM ai_accounts WHERE id=$1 FOR NO KEY UPDATE',[supplier]);
 const request=crypto.randomUUID(),a=perform(request,'Same report'),b=perform(request,'Same report');a.catch(()=>{});b.catch(()=>{});
 for(let i=0;clients.length<2&&i<300;i++)await new Promise(r=>setTimeout(r,10));assert.equal(clients.length,2);await Promise.all(clients.map(waitBlocked));await blocker.query('COMMIT');
 const concurrent=await Promise.all([a,b]);assert.equal(concurrent.filter(r=>r.replayed).length,1);assert.equal(Number((await db.query('SELECT count(*) FROM ai_audit')).rows[0].count),1);
 assert.equal(Number((await db.query('SELECT count(*) FROM ai_fulfilment_requests')).rows[0].count),1);
 const competing=crypto.randomUUID(),results=await Promise.allSettled([perform(competing,'First content'),perform(competing,'Other content')]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.find(r=>r.status==='rejected').reason.status,409);
 const before=(await db.query('SELECT unavailable_reason,updated_at FROM ai_orders WHERE id=$1',[order])).rows[0];
 // Rotation that wins the connector row race must prevent an in-flight old key write.
 await blocker.query('BEGIN');await blocker.query('UPDATE ai_supplier_connectors SET token_hash=$2 WHERE id=$1',[connector,hash('rotated')]);
 let waitingPid;const revoked=perform(crypto.randomUUID(),'Must not commit',{beforeAuth:pid=>{waitingPid=pid;}});revoked.catch(()=>{});
 for(let i=0;!waitingPid&&i<300;i++)await new Promise(r=>setTimeout(r,10));await waitBlocked(waitingPid);await blocker.query('COMMIT');await assert.rejects(revoked,e=>e.status===403);
 assert.deepEqual((await db.query('SELECT unavailable_reason,updated_at FROM ai_orders WHERE id=$1',[order])).rows[0],before);
 await db.query('UPDATE ai_supplier_connectors SET token_hash=$2 WHERE id=$1',[connector,hash(token)]);
 // An audit failure rolls back both the business change and its replay receipt.
 await db.query("CREATE FUNCTION reject_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Synthetic audit failure'; END $$; CREATE TRIGGER reject_audit BEFORE INSERT ON ai_audit FOR EACH ROW EXECUTE FUNCTION reject_audit()");
 const retry=crypto.randomUUID();await assert.rejects(perform(retry,'After retry'));assert.equal((await db.query('SELECT 1 FROM ai_fulfilment_requests WHERE request_key=$1',[retry])).rowCount,0);assert.deepEqual((await db.query('SELECT unavailable_reason,updated_at FROM ai_orders WHERE id=$1',[order])).rows[0],before);
 await db.query('DROP TRIGGER reject_audit ON ai_audit');assert.equal((await perform(retry,'After retry')).ok,true);
 // Current account suspension is rechecked under the same transaction lock.
 await blocker.query('BEGIN');await blocker.query("UPDATE ai_accounts SET status='suspended' WHERE id=$1",[supplier]);waitingPid=null;
 const suspended=perform(crypto.randomUUID(),'Suspended',{beforeAuth:pid=>{waitingPid=pid;}});suspended.catch(()=>{});for(let i=0;!waitingPid&&i<300;i++)await new Promise(r=>setTimeout(r,10));await waitBlocked(waitingPid);await blocker.query('COMMIT');await assert.rejects(suspended,e=>e.status===403);
 assert.equal(Number((await db.query('SELECT quantity FROM ai_stock WHERE id=$1',[stock])).rows[0].quantity),10);
 console.log('Supplier PostgreSQL feedback passed: observed concurrent replay locks, changed-request conflict, connector rotation and suspension races, full audit rollback/retry and unchanged stock.');
}finally{await blocker?.query('ROLLBACK').catch(()=>{});blocker?.release();await db.end();await admin.query('DROP SCHEMA '+schema+' CASCADE');await admin.end();}
