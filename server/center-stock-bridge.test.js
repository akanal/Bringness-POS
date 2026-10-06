import test from 'node:test';import assert from 'node:assert/strict';
import {applyCenterStock} from './center-stock-bridge.js';
function fixture(){const inserts=[],requests=[];const client={query:async(sql,args)=>{
 if(sql.includes('to_regclass'))return {rows:[{relation:'pos_stock_links'}]};
 if(sql.includes('FROM pos_stock_links'))return {rows:[{connector_id:'connector',account_id:'account'}]};
 if(sql.includes('FROM users'))return {rows:[{id:'owner'}]};
 if(sql.includes('FROM order_items'))return {rows:[{product_id:'product',quantity:'2'}]};
 inserts.push(args);return {rows:[]};}};
 const dependencies={stockPool:{query:async()=>({rows:[{pos_user_id:'owner',pos_company_id:'company'}]})},kitchenAction:async(pool,user,request)=>requests.push(request)};
 return {client,dependencies,inserts,requests};}
test('center acceptance reserves and start consumes with distinct stable request IDs',async()=>{
 const f=fixture();await applyCenterStock(f.client,'order','restaurant','accept',f.dependencies);await applyCenterStock(f.client,'order','restaurant','accept',f.dependencies);await applyCenterStock(f.client,'order','restaurant','start',f.dependencies);
 assert.equal(f.requests[0].requestKey,f.requests[1].requestKey);assert.notEqual(f.requests[0].requestKey,f.requests[2].requestKey);assert.equal(f.requests[0].orderId,'pos:order');assert.deepEqual(f.requests[0].items,[{productCode:'product',quantity:2}]);assert.equal(f.requests[2].action,'start');assert.equal(f.inserts.length,3);
});
test('failed stock booking cannot create a confirmed POS command',async()=>{const f=fixture();f.dependencies.kitchenAction=async()=>{throw Error('stock unavailable')};await assert.rejects(applyCenterStock(f.client,'order','restaurant','start',f.dependencies),/stock unavailable/);assert.equal(f.inserts.length,0);});
test('missing bridge schema fails closed',async()=>assert.rejects(applyCenterStock({query:async()=>({rows:[{relation:null}]})},'order','restaurant','accept'),/POS_STOCK_SCHEMA_MISSING/));
