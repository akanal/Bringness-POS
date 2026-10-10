import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('./index.js',import.meta.url),'utf8');
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
const featureSource=source.split('\n').find(l=>l.startsWith('async function requireFeature'));
const requireFeature=new AsyncFunction('x','res','code','hasFeature','json',featureSource+';return requireFeature(x,res,code)');
const modeSource=source.split('\n').find(l=>l.includes('Nur Administratoren dürfen die Betriebsart ändern'));
const createSource=source.split('\n').find(l=>l.startsWith('if(p==="/api/v1/restaurants"&&req.method==="POST")'));
async function attempt({create=false,mode='restaurant',licensed=false,role='owner',exists=true}={}){
 let reply,writes=0,checks=0;
 const json=(_r,status,data)=>{reply={status,...data}};
 const user={id:'owner',company_id:'company',role};
 const pool={query:async(sql,args)=>{writes++;assert.ok(sql.startsWith(create?'INSERT INTO restaurants':'UPDATE restaurants'));assert.ok(args.includes('company'));return {rowCount:exists?1:0,rows:exists?[{id:'restaurant',mode}]:[]}}};
 const guard=async(x,res,code)=>requireFeature(x,res,code,async(company,feature)=>{checks++;assert.equal(company,'company');assert.equal(feature,'restaurant');return licensed},json);
 const handler=new AsyncFunction('p','req','res','auth','body','pool','json','requireFeature',create?createSource:modeSource);
 await handler(create?'/api/v1/restaurants':'/api/v1/restaurants/11111111-1111-1111-1111-111111111111/mode',{method:create?'POST':'PUT'},{},async()=>user,async()=>({mode,name:'Test'}),pool,json,guard);
 return {reply,writes,checks};
}
for(const create of [false,true]){
 test(`${create?'creation':'mode change'} rejects a missing or inactive restaurant license before writing`,async()=>{const r=await attempt({create});assert.equal(r.reply.status,402);assert.equal(r.reply.upgradeRequired,true);assert.equal(r.reply.feature,'restaurant');assert.equal(r.writes,0);assert.equal(r.checks,1)});
 test(`${create?'creation':'mode change'} accepts an active restaurant license`,async()=>{const r=await attempt({create,licensed:true});assert.equal(r.reply.status,create?201:200);assert.equal(r.writes,1)});
 test(`${create?'creation':'mode change'} permits counter mode without restaurant license`,async()=>{const r=await attempt({create,mode:'counter'});assert.equal(r.reply.status,create?201:200);assert.equal(r.checks,0)});
}
test('cashiers cannot change the business mode',async()=>{const r=await attempt({role:'cashier',licensed:true});assert.equal(r.reply.status,403);assert.equal(r.writes,0)});
test('invalid modes never write',async()=>{for(const create of [false,true]){const r=await attempt({create,mode:'invalid'});assert.equal(r.reply.status,400);assert.equal(r.writes,0)}});
