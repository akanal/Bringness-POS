import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createPaymentCheckout} from './payment-checkout.js';

const UUID='11111111-1111-4111-8111-111111111111';
const PRODUCT='22222222-2222-4222-8222-222222222222';
const user={id:UUID,company_id:UUID,role:'owner'};
function request(authorization='Bearer test-token'){
 const req=new EventEmitter();
 req.url='/api/v1/orders/checkout';req.method='POST';req.headers={authorization};
 return req;
}
function response(){
 return {status:null,body:null,writeHead(status){this.status=status;},end(raw){this.body=JSON.parse(raw);}};
}
async function run(body,{actor=user}={}){
 const calls=[];
 const pool={async query(sql){calls.push(sql);if(sql.includes('FROM sessions'))return {rows:actor?[actor]:[]};throw Error('Unexpected database query');},async connect(){throw Error('Checkout must not start a transaction for invalid input');}};
 const handler=createPaymentCheckout(pool),req=request(),res=response();
 const done=handler(req,res);
 setImmediate(()=>{req.emit('data',Buffer.from(JSON.stringify(body)));req.emit('end');});
 await done;
 return {res,calls};
}
const valid=()=>({restaurantId:UUID,items:[{productId:PRODUCT,qty:1}],payments:[{method:'cash',amountCents:100}]});
test('unauthenticated checkout is rejected before any writes',async()=>{
 const {res,calls}=await run(valid(),{actor:null});
 assert.equal(res.status,401);assert.equal(calls.length,1);
});
test('non-management role cannot settle sales',async()=>{
 const {res,calls}=await run(valid(),{actor:{...user,role:'waiter'}});
 assert.equal(res.status,403);assert.equal(calls.length,1);
});
test('card checkout requires explicit terminal confirmation before database writes',async()=>{
 const body=valid();body.payments=[{method:'card',amountCents:100}];
 const {res,calls}=await run(body);
 assert.equal(res.status,409);assert.match(res.body.error,/Kartenzahlung/);assert.equal(calls.length,1);
});
test('invalid split payments cannot reach checkout transaction',async()=>{
 for(const payments of [[],[{method:'cash',amountCents:0}],[{method:'cash',amountCents:-1}],[{method:'cash',amountCents:1.5}],[{method:'unknown',amountCents:100}],Array.from({length:3},()=>({method:'cash',amountCents:1}))]){
  const {res,calls}=await run({...valid(),payments});
  assert.equal(res.status,400);assert.equal(calls.length,1);
 }
});

test('client-reported card confirmation cannot create a paid order',async()=>{
 const body=valid();body.payments=[{method:'card',amountCents:100}];body.externalCardConfirmed=true;
 const {res,calls}=await run(body);
 assert.equal(res.status,409);assert.equal(calls.length,1);
});

test('mixed cash and card cannot bypass card verification',async()=>{
 const body=valid();body.payments=[{method:'cash',amountCents:50},{method:'card',amountCents:50}];body.externalCardConfirmed=true;
 const result=await run(body);
 assert.equal(result.res.status,409);
 assert.equal(result.calls.length,1);
});

test('repeated product IDs are rejected before payment creation',async()=>{
 const body=valid();body.items.push({productId:PRODUCT,qty:1});
 const result=await run(body);
 assert.equal(result.res.status,400);
 assert.equal(result.calls.length,1);
});
