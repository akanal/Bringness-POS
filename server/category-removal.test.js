import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('./index.js',import.meta.url),'utf8').split('\n').find(l=>l.includes('RETURNING c.id')&&l.includes('req.method==="DELETE"'));
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
async function remove({empty=false,owned=true}={}){let reply;const queries=[];await new AsyncFunction('p','req','res','auth','pool','json',source)('/api/v1/categories/11111111-1111-1111-1111-111111111111',{method:'DELETE'},{},async()=>({company_id:'owner'}),{query:async(sql,args)=>{queries.push(sql);assert.equal(args[1],'owner');return {rowCount:sql.startsWith('UPDATE')?(empty&&owned?1:0):(owned?1:0)}}},(_r,status,data)=>reply={status,...data});return {reply,queries}}
test('empty category is deactivated without deleting historical data',async()=>{const r=await remove({empty:true});assert.equal(r.reply.status,200);assert.match(r.queries[0],/SET active=false/);assert.match(r.queries[0],/NOT EXISTS.*p.active=true/)});
test('category with active products is refused',async()=>{const r=await remove();assert.equal(r.reply.status,409)});
test('category owned by another company is refused',async()=>{const r=await remove({empty:true,owned:false});assert.equal(r.reply.status,404)});
