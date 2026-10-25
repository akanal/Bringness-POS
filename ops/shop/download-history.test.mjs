import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {historyFixture,seedDownloadHistory} from './download-history-fixture.mjs';
import {seller} from './download-fixture.mjs';
import {readShopDownloadHistory,migrateShopDownloadHistory} from '../../server/shop-download-history.js';
import {createShopDownloadRuntime} from '../../server/shop-download-http.js';
import {validDownloadHistory,readDownloadHistory} from '../../apps/web/public/shop/download-history-client.js';
test('history preserves original amounts and paginates every microsecond without duplication',async()=>{
 const f=await historyFixture();try{
  await migrateShopDownloadHistory(f.pool);await migrateShopDownloadHistory(f.pool);await f.db.exec("UPDATE billing_plans SET amount_cents=1;UPDATE company_billing_profiles SET company_name='Changed'");
  const first=await readShopDownloadHistory(f.pool,{token:'owner-a'});assert.equal(first.items.length,10);assert.equal(validDownloadHistory(first),true);
  assert.match(JSON.parse(Buffer.from(first.nextCursor,'base64url')).time,/\.0000\d{2}Z$/);
  const second=await readShopDownloadHistory(f.pool,{token:'owner-a',cursor:first.nextCursor}),third=await readShopDownloadHistory(f.pool,{token:'owner-a',cursor:second.nextCursor}),all=[...first.items,...second.items,...third.items];
  assert.equal(third.nextCursor,null);assert.equal(all.length,24);assert.equal(new Set(all.map(i=>i.id)).size,24);assert.ok(all.every(i=>i.netCents===39900&&i.grossCents===47481&&i.licence==='blocked'&&i.purchaseCompleted===false));
  const expected=(await f.db.query("SELECT id FROM shop_checkout_orders WHERE company_id=$1 ORDER BY created_at DESC,id DESC",[f.a])).rows.map(r=>r.id);assert.deepEqual(all.map(i=>i.id),expected);
  for(const key of ['company_id','billing_snapshot','session_hash','provider_payment_id','invoice_number','buyer','seller'])assert.equal(JSON.stringify(first).includes(key),false);
  assert.equal((await f.db.query('SELECT 1 FROM billing_transactions')).rows.length,0);assert.equal((await f.db.query('SELECT 1 FROM company_entitlements')).rows.length,0);
 }finally{await f.db.close();}
});
test('company, role, filter and cursor scope isolation apply independently',async()=>{
 const f=await historyFixture();try{
  await seedDownloadHistory(f,{company:f.b,count:1});await seedDownloadHistory(f,{count:1,product:'pos-online'});
  const first=await readShopDownloadHistory(f.pool,{token:'owner-a'}),foreign=await readShopDownloadHistory(f.pool,{token:'owner-b'});assert.equal(foreign.items.length,1);assert.equal(first.items.some(i=>i.id===foreign.items[0].id),false);
  await assert.rejects(readShopDownloadHistory(f.pool,{token:'owner-b',cursor:first.nextCursor}),{code:'ACCOUNT_CHANGED'});
  for(const [token,code]of [['waiter','FORBIDDEN'],['expired','UNAUTHORIZED'],['inactive','UNAUTHORIZED'],['reset','UNAUTHORIZED']])await assert.rejects(readShopDownloadHistory(f.pool,{token}),{code});
  const paid=await readShopDownloadHistory(f.pool,{token:'owner-a',status:'paid'});assert.equal(paid.items.length,4);assert.ok(paid.items.every(i=>i.status==='paid'));assert.equal(paid.nextCursor,null);
  await assert.rejects(readShopDownloadHistory(f.pool,{token:'owner-a',status:'paid',cursor:first.nextCursor}),{code:'INVALID_REQUEST'});await assert.rejects(readShopDownloadHistory(f.pool,{token:'owner-a',status:'completed'}),{code:'INVALID_REQUEST'});
 }finally{await f.db.close();}
});
test('new arrivals do not displace older pages; a missing cursor anchor does not break continuation',async()=>{
 const f=await historyFixture();try{
  const first=await readShopDownloadHistory(f.pool,{token:'owner-a'}),anchor=first.items.at(-1).id,created=(await seedDownloadHistory(f,{count:1}))[0];await f.db.query('UPDATE shop_checkout_orders SET created_at=clock_timestamp() WHERE id=$1',[created]);await f.db.query('DELETE FROM shop_checkout_orders WHERE id=$1',[anchor]);
  const second=await readShopDownloadHistory(f.pool,{token:'owner-a',cursor:first.nextCursor});assert.equal(second.items.some(i=>i.id===created||first.items.some(old=>old.id===i.id)),false);
  assert.equal((await readShopDownloadHistory(f.pool,{token:'owner-a'})).items[0].id,created);
 }finally{await f.db.close();}
});
test('malformed cursors and corrupted snapshots fail closed without partial history',async()=>{
 const noDb={connect(){throw Error('unexpected database access');}};
 for(const cursor of ['', '!', 'a'.repeat(513),Buffer.from('{}').toString('base64url'),Buffer.from([0xff]).toString('base64url')])await assert.rejects(readShopDownloadHistory(noDb,{token:'fixture',cursor}),{code:'INVALID_REQUEST'});
 const f=await historyFixture();try{await f.db.exec("UPDATE shop_checkout_orders SET snapshot=jsonb_set(snapshot,'{grossCents}','1')");await assert.rejects(readShopDownloadHistory(f.pool,{token:'owner-a'}),{code:'FULFILMENT_MISMATCH'});}finally{await f.db.close();}
});
test('candidate HTTP history is GET-only, strict, authenticated and compatible with the browser reader',async()=>{
 const f=await historyFixture(),origin='https://fixture.example.test',runtime=createShopDownloadRuntime(f.pool,{enabled:true,seller,publicOrigin:origin});await runtime.migrate();const server=http.createServer(async(req,res)=>{if(!await runtime.handle(req,res)){res.writeHead(404);res.end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));const local=`http://127.0.0.1:${server.address().port}`;
 try{
  const requests=[],fetcher=(url,options)=>{requests.push(options);return fetch(local+url,options);};const page=await readDownloadHistory({token:'owner-a',fetcher});assert.equal(page.items.length,10);assert.equal(requests[0].method,'GET');assert.equal(requests[0].credentials,'omit');assert.equal(requests[0].redirect,'error');
  for(const [suffix,options,status]of [['?status=all&status=paid',{},400],['?cursor=x&cursor=y',{},400],['?token=owner-a',{},400],['?status=completed',{},400],['',{method:'POST'},405],['',{headers:{Origin:'https://evil.test'}},403],['',{headers:{Authorization:''}},401],['',{headers:{Authorization:'Bearer waiter'}},403]]){
   const res=await fetch(local+'/api/v1/shop/downloads/history'+suffix,{...options,headers:{Authorization:'Bearer owner-a',...options.headers}});assert.equal(res.status,status);assert.equal(res.headers.get('cache-control'),'private, no-store');assert.equal(res.headers.get('access-control-allow-origin'),null);
  }
 }finally{await new Promise(r=>server.close(r));await f.db.close();}
});
test('identical timestamps are ordered by UUID and every record remains reachable',async()=>{
 const f=await historyFixture();try{
  await f.db.exec("UPDATE shop_checkout_orders SET created_at='2026-10-24T12:00:00.123456Z'");const ids=[];let cursor=null;
  do{const p=await readShopDownloadHistory(f.pool,{token:'owner-a',cursor});ids.push(...p.items.map(i=>i.id));cursor=p.nextCursor;}while(cursor);
  const expected=(await f.db.query('SELECT id FROM shop_checkout_orders ORDER BY id DESC')).rows.map(r=>r.id);assert.deepEqual(ids,expected);assert.equal(new Set(ids).size,24);
 }finally{await f.db.close();}
});
