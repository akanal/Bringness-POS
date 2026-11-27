import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {createHash} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {JSDOM} from 'jsdom';
import {readFile} from 'node:fs/promises';
import {createDeliveryPortal} from '../delivery-portal.js';
import {createPortalAdvertising,migratePortalAdvertising} from '../portal-advertising.js';
const db=new PGlite();
await db.exec(`CREATE TABLE users(id uuid PRIMARY KEY,status text,must_change_password boolean);
CREATE TABLE sessions(user_id uuid,token_hash text,expires_at timestamptz);
CREATE TABLE platform_admins(user_id uuid,active boolean);
CREATE TABLE platform_owner(user_id uuid);`);
const uid='00000000-0000-0000-0000-000000000001',id='00000000-0000-0000-0000-000000000002';
await db.query(`INSERT INTO users VALUES($1,'active',false)`,[uid]);
await db.query(`INSERT INTO sessions VALUES($1,$2,now()+interval '1 hour')`,[uid,createHash('sha256').update('owner').digest('hex')]);
await db.query('INSERT INTO platform_admins VALUES($1,true)',[uid]);await db.query('INSERT INTO platform_owner VALUES($1)',[uid]);
const pool={query:(...args)=>db.query(...args),async connect(){return {query:(...args)=>db.query(...args),release(){}};}};
await migratePortalAdvertising(pool);await migratePortalAdvertising(pool);
const handler=createPortalAdvertising(pool);
async function request({body,publicRead=false,token='owner'}={}){
  const req=Readable.from(body?[JSON.stringify(body)]:[]);req.url=publicRead?'/api/v1/delivery-portal/advertising':'/api/v1/platform/advertising';req.method=body?'PUT':'GET';req.headers={authorization:'Bearer '+token};let result;
  await handler(req,{writeHead(code){result={code};},end(value){result.data=JSON.parse(value);}});return result;
}
const base={id,version:0,title:'Produkt',caption:'Text <script>',image:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLttAAAAABJRU5ErkJggg==',link:'https://example.com/produkt',position:0,active:false,startsAt:null,endsAt:null};
assert.equal((await request({body:base})).code,200);
assert.equal((await request({publicRead:true})).data.advertisements.length,0);
// Lost response replay does not create another version or audit event.
assert.equal((await request({body:base})).data.advertisement.version,1);
assert.equal((await db.query('SELECT count(*)::int n FROM portal_advertising_audit')).rows[0].n,1);
assert.equal((await request({body:{...base,title:'stale'}})).code,409);
const active={...base,version:1,active:true};assert.equal((await request({body:active})).code,200);
assert.equal((await request({publicRead:true})).data.advertisements.length,1);
const future={...active,version:2,startsAt:'2099-01-01T00:00:00.000Z'};assert.equal((await request({body:future})).code,200);assert.equal((await request({publicRead:true})).data.advertisements.length,0);
assert.equal((await request({body:{...active,version:3,endsAt:'2000-01-01T00:00:00.000Z'}})).code,200);assert.equal((await request({publicRead:true})).data.advertisements.length,0);
await db.query('UPDATE platform_admins SET active=false');assert.equal((await request()).code,403);assert.equal((await request({body:{...active,version:4}})).code,403);
await db.query('UPDATE platform_admins SET active=true');await db.query("UPDATE sessions SET expires_at=now()-interval '1 minute'");assert.equal((await request()).code,403);
// Rendering treats captions and titles as text and rejects unsafe navigation.
const dom=new JSDOM('<aside></aside>');globalThis.document=dom.window.document;
const {renderAdvertisements}=await import('../../apps/web/public/bestellen/advertising-view.js');const host=document.querySelector('aside');
renderAdvertisements(host,[base,{...base,link:'javascript:alert(1)'}]);assert.equal(host.querySelectorAll('article').length,1);assert.equal(host.querySelectorAll('script').length,0);assert.equal(host.querySelector('p').textContent,base.caption);
renderAdvertisements(host,[]);assert.equal(host.hidden,true);
for(const path of ['../../apps/web/public/admin/advertising.html','../../apps/web/public/pos/setup.html'])assert.ok(await readFile(new URL(path,import.meta.url),'utf8'));
// Existing POS portal: sector persistence never enables pickup or delivery.
await db.exec("ALTER TABLE users ADD company_id uuid; ALTER TABLE users ADD role text; CREATE TABLE restaurants(id uuid PRIMARY KEY,company_id uuid); CREATE TABLE products(id uuid PRIMARY KEY,restaurant_id uuid,name text,active boolean); CREATE TABLE pos_delivery_locations(restaurant_id uuid PRIMARY KEY,settings jsonb);");
await db.query("UPDATE users SET company_id=$1,role='owner'",[uid]);await db.query("UPDATE sessions SET expires_at=now()+interval '1 hour'");await db.query('INSERT INTO restaurants VALUES($1,$2)',[id,uid]);
const portal=createDeliveryPortal(pool);
async function savePortal(body){const req=Readable.from([JSON.stringify(body)]);req.method='PUT';req.url='/api/v1/pos/delivery-portal?restaurantId='+id;req.headers={authorization:'Bearer owner'};let result;await portal(req,{writeHead(code){result={code};},end(value){result.data=JSON.parse(value);}});return result;}
const settings={sector:'newsstand',pickup:false,delivery:false,postcode:'',zones:[],minutes:30,feeCents:0,minimumCents:0,productIds:[]};
assert.equal((await savePortal(settings)).code,200);
const {sector,...legacy}=settings;const preserved=await savePortal(legacy);assert.equal(preserved.data.settings.sector,'newsstand');assert.equal(preserved.data.settings.pickup,false);assert.equal(preserved.data.settings.delivery,false);
assert.equal((await savePortal({...settings,icon:'custom'})).code,400);assert.equal((await savePortal({...settings,sector:'unknown'})).code,400);
await db.close();console.log('Advertising database: drafts, activation, expiry, stale versions, replay, audit, revoked/expired access and safe rendering passed.');
