import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const app=readFileSync(new URL('../apps/web/public/pos/app.js',import.meta.url),'utf8');
test('photos render as images and ordinary text is escaped',()=>{const c=vm.createContext({esc:s=>String(s).replaceAll('<','&lt;').replaceAll('"','&quot;')});vm.runInContext(app.slice(app.indexOf('function productPhotoMarkup('),app.indexOf('function uploadProductPhoto(')),c);assert.match(c.productPhotoMarkup('data:image/jpeg;base64,/9j/','Pizza'),/<img/);assert.doesNotMatch(c.productPhotoMarkup('<script>','Pizza'),/<script>/)});
const route=readFileSync(new URL('./index.js',import.meta.url),'utf8').split('\n').find(l=>l.includes('req.method==="PUT"')&&l.includes('Ungültiges Foto'));
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
async function photo(image,owned=true){let reply,writes=0;await new AsyncFunction('p','req','res','auth','body','pool','json',route)('/api/v1/products/11111111-1111-1111-1111-111111111111/photo',{method:'PUT'},{},async()=>({company_id:'company'}),async()=>({image}),{query:async(sql,args)=>{writes++;assert.match(sql,/r.company_id=\$3/);assert.equal(args[2],'company');assert.equal(args[1],'11111111-1111-1111-1111-111111111111');return {rowCount:owned?1:0}}},(_r,status,data)=>reply={status,...data});return {reply,writes}}
test('photo update is restricted to an owned active product',async()=>{assert.equal((await photo('data:image/jpeg;base64,/9j/')).reply.status,200);assert.equal((await photo('data:image/jpeg;base64,/9j/',false)).reply.status,404)});
test('invalid formats and oversized photos do not write',async()=>{for(const image of ['data:image/svg+xml;base64,AAAA','https://example.com/p.jpg','data:image/jpeg;base64,'+'A'.repeat(750001)]){const r=await photo(image);assert.equal(r.reply.status,400);assert.equal(r.writes,0)}});
