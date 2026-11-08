import {createRequire} from 'node:module';process.env.SHOP_PGLITE_PATH ||= createRequire(import.meta.url).resolve('@electric-sql/pglite');
import assert from 'node:assert/strict';import crypto from 'node:crypto';import http from 'node:http';import {fixture} from '../../ops/shop/fixture.mjs';import {createPosInventory,migratePosInventory} from '../pos-inventory.js';
const f=await fixture(),rid=crypto.randomUUID(),other=crypto.randomUUID(),pid=crypto.randomUUID(),legacy=crypto.randomUUID();
await f.db.exec('CREATE TABLE restaurants(id uuid PRIMARY KEY,company_id uuid);CREATE TABLE products(id uuid PRIMARY KEY,restaurant_id uuid,name text,active boolean);');
await f.pool.query('INSERT INTO restaurants VALUES($1,$2),($3,$4)',[rid,f.a,other,f.b]);await f.pool.query("INSERT INTO products VALUES($1,$3,'Testartikel',true),($2,$3,'Altbestand',true)",[pid,legacy,rid]);
await migratePosInventory(f.pool);
await f.pool.query('INSERT INTO pos_inventory_counts VALUES($1,$2,7,12,3,20,clock_timestamp())',[legacy,rid]);
const old={requestId:crypto.randomUUID(),restaurantId:rid,productId:legacy,expectedRevision:6,countedUnits:12,minimumUnits:3,targetUnits:20},oldResponse={productId:legacy,revision:7,requestId:old.requestId};
const digest=crypto.createHash('sha256').update(JSON.stringify([old.productId,old.expectedRevision,old.countedUnits,old.minimumUnits,old.targetUnits])).digest('hex');await f.pool.query('INSERT INTO pos_inventory_requests VALUES($1,$2,$3,$4)',[rid,old.requestId,digest,oldResponse]);
await migratePosInventory(f.pool);
const handler=createPosInventory(f.pool),server=http.createServer((req,res)=>handler(req,res));await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
async function call(path,token='owner-a',body){const r=await fetch(base+'/api/v1/pos-inventory'+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,...(body?{Origin:'https://bringness.de','content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,cache:r.headers.get('cache-control'),data:await r.json()};}
const history=(params={},token='owner-a')=>call('/history?'+new URLSearchParams({restaurantId:rid,...params}),token);
const command=(extra={})=>({requestId:crypto.randomUUID(),restaurantId:rid,productId:pid,expectedRevision:0,countedUnits:2,minimumUnits:3,targetUnits:8,...extra});
try{
 const empty=await history();assert.equal(empty.status,200);assert.equal(empty.cache,'no-store');assert.equal(empty.data.asOf,'0');assert.deepEqual(empty.data.rows,[]);assert(Number.isFinite(Date.parse(empty.data.recordingSince)));
 assert.deepEqual((await call('','owner-a',old)).data,oldResponse);assert.equal((await history()).data.rows.length,0,'legacy replay never invents an event');
 const first=command();assert.equal((await call('','owner-a',first)).status,200);const firstPage=(await history({limit:'1'})).data;assert.equal(firstPage.rows.length,1);const one=firstPage.rows[0];assert.equal(one.before_counted_units,null);assert.equal(one.previous_revision,0);assert.equal(one.counted_units,2);assert.equal(one.revision,1);assert.equal(one.product_name,'Testartikel');assert(one.actor_id);assert.equal(one.actor_label,'Fixture Owner');
 const count=(await f.pool.query('SELECT counted_at FROM pos_inventory_counts WHERE product_id=$1',[pid])).rows[0];assert.equal(Date.parse(one.counted_at),new Date(count.counted_at).getTime());
 await call('','owner-a',first);assert.equal((await history()).data.rows.length,1,'same command creates exactly one event');assert.equal((await call('','owner-a',{...first,countedUnits:9})).status,409);assert.equal((await history()).data.rows.length,1);
 await f.pool.query("UPDATE users SET display_name='=New Owner' WHERE company_id=$1",[f.a]);await f.pool.query("UPDATE products SET name='=Neuer Artikel' WHERE id=$1",[pid]);
 const second=command({expectedRevision:1,countedUnits:5,minimumUnits:4,targetUnits:10});assert.equal((await call('','owner-a',second)).status,200);
 const page=(await history({limit:'1'})).data;assert.equal(page.asOf,'2');assert.equal(page.nextCursor,'2');assert.equal(page.rows[0].before_counted_units,2);assert.equal(page.rows[0].before_minimum_units,3);assert.equal(page.rows[0].before_target_units,8);assert.equal(page.rows[0].actor_label,'=New Owner');
 const third=command({expectedRevision:2,countedUnits:6});assert.equal((await call('','owner-a',third)).status,200);
 const older=(await history({limit:'1',asOf:page.asOf,cursor:page.nextCursor})).data;assert.equal(older.rows[0].event_number,'1');assert.equal(older.rows[0].actor_label,'Fixture Owner');assert.equal(older.nextCursor,null);
 assert.equal((await history({asOf:'2'})).data.rows.length,2,'snapshot excludes later writes');assert.equal((await history({q:'Testartikel'})).data.rows.length,1);assert.equal((await history({q:'%'})).data.rows.length,0);assert.equal((await history({productId:legacy})).data.rows.length,0);
 const when=one.counted_at;assert.equal((await history({from:when,to:new Date(Date.parse(when)+1).toISOString()})).data.rows.length,1);
 for(const params of [{from:'2026-02-30T00:00:00.000Z'},{limit:'101'},{asOf:'9223372036854775808'},{cursor:'1'},{asOf:'1',cursor:'2'},{asOf:'99'},{productId:'invalid'},{unexpected:'x'}])assert.equal((await history(params)).status,400);
 assert.equal((await call('/history?restaurantId='+rid+'&restaurantId='+rid)).status,400);assert.equal((await call('/history','owner-a',{})).status,405);
 for(const [token,status]of [['missing',401],['expired',401],['inactive',401],['reset',401],['waiter',403],['owner-b',404]])assert.equal((await history({},token)).status,status);
 assert.equal((await history({restaurantId:other})).status,404);assert.equal((await history({restaurantId:other},'owner-b')).data.rows.length,0);
 await f.pool.query('UPDATE products SET active=false WHERE id=$1',[pid]);assert.equal((await history()).data.rows.length,3);await call('','owner-a',first);assert.equal((await history()).data.rows.length,3,'inactive replay remains one historical event');await f.pool.query('UPDATE products SET active=true WHERE id=$1',[pid]);
 for(const sql of ['UPDATE pos_inventory_history SET counted_units=99','DELETE FROM pos_inventory_history','TRUNCATE pos_inventory_history'])await assert.rejects(()=>f.pool.query(sql),/read only/);
 // A failed history append must roll back the count and idempotency record together.
 await f.pool.query(`CREATE FUNCTION inventory_history_test_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test history storage failure'; END $$`);await f.pool.query('CREATE TRIGGER inventory_history_test_failure BEFORE INSERT ON pos_inventory_history FOR EACH ROW EXECUTE FUNCTION inventory_history_test_failure()');
 const failed=command({expectedRevision:3,countedUnits:99});assert.equal((await call('','owner-a',failed)).status,503);assert.equal((await f.pool.query('SELECT counted_units,revision FROM pos_inventory_counts WHERE product_id=$1',[pid])).rows[0].counted_units,6);assert.equal((await f.pool.query('SELECT 1 FROM pos_inventory_requests WHERE request_id=$1',[failed.requestId])).rows.length,0);assert.equal((await history()).data.rows.length,3);
 await f.pool.query('DROP TRIGGER inventory_history_test_failure ON pos_inventory_history');assert.equal((await call('','owner-a',failed)).status,200);assert.equal((await history()).data.rows.length,4);
 const before=(await history()).data.recordingSince;await migratePosInventory(f.pool);assert.equal((await history()).data.recordingSince,before,'migration does not restart recording or backfill');
 await f.pool.query('UPDATE restaurants SET company_id=$1 WHERE id=$2',[f.b,rid]);assert.equal((await history()).status,404);const transferred=await history({},'owner-b');assert.equal(transferred.data.asOf,'0');assert.equal(transferred.data.rows.length,0,'new company cannot read previous company history');
 await f.pool.query('UPDATE restaurants SET company_id=$1 WHERE id=$2',[f.a,rid]);assert.equal((await history()).data.rows.length,4);
 console.log('POS inventory history: atomic snapshots, actor attribution, immutable retries/SQL, stable paging/filtering, no legacy backfill, access isolation and rollback recovery passed.');
}finally{await new Promise(r=>server.close(r));await f.db.close();}
