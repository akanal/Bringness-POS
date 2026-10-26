import {test} from 'node:test';import assert from 'node:assert/strict';import crypto from 'node:crypto';
import {validateOffer} from '../../apps/web/public/shop/offer-policy.js';
const offer=validateOffer({title:'Fixture',category:'Baby',kind:'physical',price:'12,50',tax:'19',stock:'2',gtin:'',condition:'new',sku:'',description:'Fixture description',delivery:'Fixture delivery',fulfilment:''});
test('seller client preserves lost replies per account, replays identically and refuses account-switch transport',async()=>{
 const saved=new Map();for(const key of ['window','document','navigator','localStorage','sessionStorage','fetch'])saved.set(key,Object.getOwnPropertyDescriptor(globalThis,key));
 const local=new Map([['bringness-pos-token','fixture-owner-a']]),session=new Map();let switchOnWrite=false,calls=[],mode='ok';const storage=map=>({getItem:key=>map.get(key)??null,setItem:(key,value)=>{map.set(key,value);if(map===session&&switchOnWrite)local.set('bringness-pos-token','fixture-owner-b');},removeItem:key=>map.delete(key)});
 try{
 Object.defineProperties(globalThis,{window:{value:new EventTarget(),configurable:true},document:{value:Object.assign(new EventTarget(),{hidden:false}),configurable:true},navigator:{value:{onLine:true},configurable:true},localStorage:{value:storage(local),configurable:true},sessionStorage:{value:storage(session),configurable:true},fetch:{value:async(url,options)=>{const command=JSON.parse(options.body);calls.push(command);if(mode==='lost')throw Error('synthetic network failure');if(mode==='conflict')return {ok:false,json:async()=>({code:'REVISION_CONFLICT'})};return {ok:true,json:async()=>({id:command.id,revision:command.expectedRevision+1,state:'draft',offer:command.offer,canPublish:false})};},configurable:true}});
 const client=await import('../../apps/web/public/shop/seller-account-client.js?client-fixture');const command=()=>({id:'offer-'+crypto.randomUUID(),requestId:crypto.randomUUID(),expectedRevision:0,action:'save',offer});
 const a=command();mode='lost';await assert.rejects(()=>client.sendSellerCommand(a));assert.deepEqual(await client.pendingSellerRequest(),a);
 local.set('bringness-pos-token','fixture-owner-b');assert.equal(await client.pendingSellerRequest(),null);const b=command();await assert.rejects(()=>client.sendSellerCommand(b));assert.equal(session.size,2);
 local.set('bringness-pos-token','fixture-owner-a');mode='ok';await client.sendSellerCommand(a,{retry:true});assert.equal(session.size,1);assert.equal(await client.pendingSellerRequest(),null);assert.deepEqual(calls[0],calls[2]);
 mode='conflict';await assert.rejects(()=>client.sendSellerCommand(command()),error=>error.code==='REVISION_CONFLICT');assert.equal(await client.pendingSellerRequest(),null);
 mode='ok';const before=calls.length;switchOnWrite=true;await assert.rejects(()=>client.sendSellerCommand(command()),error=>error.code==='ACCOUNT_CHANGED');assert.equal(calls.length,before,'Account change must prevent transport');
 local.set('bringness-pos-token','fixture-owner-b');assert.deepEqual(await client.pendingSellerRequest(),b,'Other account pending reference must survive');
 }finally{for(const [key,descriptor]of saved){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}}
});
