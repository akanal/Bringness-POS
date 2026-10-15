import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {createModuleQuoteHandler} from './module-quote-api.js';
function request(modules,token='test-token'){
 const req=Readable.from([JSON.stringify({modules})]);
 req.url='/api/v1/billing/module-quote';req.method='POST';req.headers={authorization:token?'Bearer '+token:''};
 return req;
}
function response(){
 const result={status:null,payload:null};
 return {result,writeHead(status){result.status=status;},end(data){result.payload=JSON.parse(data);}};
}
const db={async query(sql){
 if(sql.includes('FROM sessions'))return {rows:[{company_id:'company-1',role:'owner'}]};
 if(sql.includes('FROM company_entitlements'))return {rows:[]};
 if(sql.includes('FROM company_features'))return {rows:[]};
 throw Error('Unexpected query');
}};
test('Quote endpoint rejects missing bearer authentication',async()=>{
 const res=response();await createModuleQuoteHandler(db)(request(['pos_base_monthly'],'') ,res);
 assert.equal(res.result.status,401);
});
test('Quote endpoint provides a non-activating Center bundle',async()=>{
 const res=response();await createModuleQuoteHandler(db)(request(['pos_base_monthly','center_monthly']),res);
 assert.equal(res.result.status,200);
 assert.equal(res.result.payload.amountNetCents,7488);
 assert.equal(res.result.payload.checkoutEnabled,false);
 assert.equal(res.result.payload.grantAccess,false);
});
test('Quote endpoint blocks incompatible ordering modes',async()=>{
 const res=response();await createModuleQuoteHandler(db)(request(['pos_base_monthly','center_monthly','table_qr_monthly']),res);
 assert.equal(res.result.status,400);
 assert.equal(res.result.payload.error,'CONFLICTING_OPERATING_MODES');
});

test('Quote API rejects Center when restaurant QR is already active',async()=>{
 const activeDb={async query(sql){
  if(sql.includes('FROM sessions'))return {rows:[{company_id:'company-1',role:'owner'}]};
  if(sql.includes('FROM company_entitlements'))return {rows:[{code:'pos_base_monthly'}]};
  if(sql.includes('FROM company_features'))return {rows:[{feature_code:'table_qr'}]};
  throw Error('Unexpected query');
 }};
 const res=response();await createModuleQuoteHandler(activeDb)(request(['center_monthly']),res);
 assert.equal(res.result.status,400);
 assert.equal(res.result.payload.error,'CONFLICTING_OPERATING_MODES');
});
test('Quote API blocks an unpriced waiter mode from checkout',async()=>{
 const res=response();await createModuleQuoteHandler(db)(request(['pos_base_monthly','waiter_order_monthly']),res);
 assert.equal(res.result.status,200);
 assert.deepEqual(res.result.payload.unpricedModules,['waiter_order_monthly']);
 assert.equal(res.result.payload.amountNetCents,null);
 assert.equal(res.result.payload.checkoutEnabled,false);
 assert.equal(res.result.payload.grantAccess,false);
});
test('Quote API does not grant access after a valid bundle preview',async()=>{
 const res=response();await createModuleQuoteHandler(db)(request(['pos_base_monthly','center_monthly','personnel_monthly']),res);
 assert.equal(res.result.status,200);
 assert.equal(res.result.payload.grantAccess,false);
 assert.equal(res.result.payload.requiresVerifiedPayment,true);
 assert.equal(res.result.payload.amountNetCents,8987);
});

test('Quote API reports database outage as server error without leaking details',async()=>{
 const failingDb={async query(){throw new Error('database password and private host');}};
 const res=response();await createModuleQuoteHandler(failingDb)(request(['pos_base_monthly']),res);
 assert.equal(res.result.status,500);
 assert.deepEqual(res.result.payload,{error:'INTERNAL_ERROR'});
});
