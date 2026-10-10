import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../apps/web/public/pos/app.js',import.meta.url),'utf8');
function fixture(search){
 const elements=new Map(),views=[],renders=[];
 const $=id=>{if(!elements.has(id))elements.set(id,{style:{},classList:{add(){},remove(){}},value:'',textContent:''});return elements.get(id)};
 let failures=0;
 const context=vm.createContext({token:'test',data:{},URLSearchParams,location:{search},document:{body:{classList:{remove(){},add(){}}}},$,console,localStorage:{removeItem(){}},render:id=>renders.push(id),showModule:view=>views.push(view),api:async path=>{if(path==='/bootstrap'){if(failures-->0)throw Object.assign(Error('Unavailable'),{status:503});return {user:{name:'Test'},restaurants:[]}}return {}}});
 vm.runInContext(source.split('\n').filter(l=>l.startsWith('let initialViewApplied=')||l.startsWith('async function load(')).join('\n'),context);
 return {context,views,renders,failNext(){failures=1}};
}
for(const search of ['?payment=return','?view=lizenz','?view=einstellungen'])test(`initial navigation is not repeated after category/product refresh: ${search}`,async()=>{
 const f=fixture(search);await f.context.load();assert.deepEqual(f.views,[search.includes('einstellungen')?'einstellungen':'lizenz']);
 f.views.length=0;await f.context.load('test-restaurant');await f.context.load('test-restaurant');assert.deepEqual(f.views,[]);assert.deepEqual(f.renders,[undefined,'test-restaurant','test-restaurant']);
});
test('a failed bootstrap does not consume the initial navigation',async()=>{const f=fixture('?payment=return');f.failNext();await f.context.load();assert.deepEqual(f.views,[]);await f.context.load();assert.deepEqual(f.views,['lizenz'])});
test('ordinary refreshes do not open billing',async()=>{const f=fixture('');await f.context.load();await f.context.load('test-restaurant');assert.deepEqual(f.views,[])});
test('successful owner login opens the cash register after loading data',async()=>{
 const nodes=new Map(),views=[],$=id=>{if(!nodes.has(id))nodes.set(id,{value:'test',textContent:''});return nodes.get(id)};
 const context=vm.createContext({$,authBusy:false,mode:'login',token:null,console,localStorage:{setItem(){}},location:{replace(){}},setAuthBusy(){},api:async()=>({token:'test',user:{role:'owner'}}),load:async()=>views.push('load'),showModule:async v=>views.push(v)});
 vm.runInContext(source.split('\n').find(l=>l.startsWith('$("authForm").onsubmit=')),context);await $('authForm').onsubmit({preventDefault(){}});assert.deepEqual(views,['load','kasse']);
});
