import {test} from 'node:test';import assert from 'node:assert/strict';import pg from 'pg';import {handleBillingAccess} from './billing-access.js';
test('password-gated accounts cannot obtain licensed downloads or write grant events',async()=>{
 const original=pg.Pool.prototype.query;let reads=0,status;
 try{pg.Pool.prototype.query=async sql=>{reads++;assert.match(sql,/must_change_password/);return {rows:[]};};
 await handleBillingAccess({url:'/api/v1/downloads/windows/access',method:'GET',headers:{authorization:'Bearer fixture'}},{writeHead(s){status=s;},end(){}});assert.equal(status,401);assert.equal(reads,1);
 }finally{pg.Pool.prototype.query=original;}
});
