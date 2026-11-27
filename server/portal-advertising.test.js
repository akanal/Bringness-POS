import assert from 'node:assert/strict';
import {test} from 'node:test';
import {validateAdvertisement,safeAdLink,createPortalAdvertising} from './portal-advertising.js';
import {businessSectors,sectorFor} from '../apps/web/public/business-sectors.js';
const ad=()=>({id:'00000000-0000-0000-0000-000000000001',version:0,title:'Produkt',caption:'Angebot',image:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLttAAAAABJRU5ErkJggg==',link:'https://example.com/angebot',active:false,position:0,startsAt:null,endsAt:null});
test('advertising rejects executable images, unsafe links and invalid schedule',()=>{
  assert.ok(validateAdvertisement(ad()));
  for(const patch of [{image:'data:image/svg+xml;base64,PHN2Zz4='},{image:'data:image/png;base64,PHNjcmlwdD4='},{link:'javascript:alert(1)'},{link:'//example.com'},{link:'https://user:pass@example.com'},{position:-1},{active:'true'},{startsAt:'2026-11-28T00:00:00.000Z',endsAt:'2026-11-27T00:00:00.000Z'}])assert.equal(validateAdvertisement({...ad(),...patch}),null);
  assert.equal(safeAdLink('https://example.com'),true);
});
test('missing and tenant-only credentials cannot manage advertising',async()=>{
  let connected=0;
  const db={async connect(){connected++;return {async query(sql){if(sql.includes('SELECT u.id')){assert.match(sql,/JOIN platform_owner/);assert.match(sql,/pa.active=true/);return {rows:[]};}return {rows:[]};},release(){}};}};
  const handle=createPortalAdvertising(db);
  async function call(token){let code;await handle({url:'/api/v1/platform/advertising',method:'GET',headers:token?{authorization:'Bearer '+token}:{}},{writeHead(c){code=c;},end(){}});return code;}
  assert.equal(await call(),401);assert.equal(connected,0);assert.equal(await call('tenant-token'),403);assert.equal(connected,1);
});
test('all stores of a sector share an immutable central icon',()=>{
  assert.equal(sectorFor('newsstand').icon,'📰');assert.equal(sectorFor('restaurant').icon,'🍕');assert.equal(sectorFor('clothing').icon,'👕');assert.equal(sectorFor('electronics').icon,'💻');
  assert.equal(sectorFor('unknown'),null);assert.ok(Object.isFrozen(businessSectors));assert.ok(businessSectors.every(Object.isFrozen));
});
