import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cancellationReview,loadCancellationReview} from './trade-cancellation-review.js';
import {createTradeHandler} from './trade-pricing.js';
const id='11111111-1111-4111-8111-111111111111',company='22222222-2222-4222-8222-222222222222';
const receipt={id,receipt_number:'HR-2026-000001',total_cents:119,order_status:'paid'};
const items=[{product_id:id,product_name_snapshot:'Original article',unit_price_cents:119,tax_rate_snapshot:19,quantity:1}];
const payments=[{method:'cash',amount_cents:119}];
const review=(r=receipt,i=items,p=payments,d=[],c=[])=>cancellationReview(r,i,p,d,c);
test('read-only review uses immutable original lines and negates original tax rounding',()=>{
 const before=JSON.stringify({receipt,items,payments});const r=review();
 assert.equal(r.status,'review_only');assert.equal(r.canCancel,false);assert.equal(r.proposedReversalCents,-119);assert.deepEqual(r.issues,[]);
 assert.deepEqual(r.taxRows,[{rate:19,netCents:-100,taxCents:-19,grossCents:-119}]);
 assert.equal(JSON.stringify({receipt,items,payments}),before);
 // Negate the already rounded positive net: recomputing the negative half would round differently.
 const half=review({...receipt,total_cents:1},[{...items[0],unit_price_cents:1,tax_rate_snapshot:100}],[{method:'cash',amount_cents:1}]);
 assert.equal(half.lines[0].netCents,-1);assert.equal(half.lines[0].taxCents,0);
});
test('saved discount allocations are retained instead of current catalogue prices',()=>{
 const r=review({...receipt,total_cents:100,sale_adjustment:{allocations:[{productId:id,discountCents:19}]}},items,[{method:'cash',amount_cents:100}]);
 assert.deepEqual(r.issues,[]);assert.equal(r.lines[0].grossCents,-100);assert.equal(r.lines[0].netCents,-84);assert.equal(r.lines[0].taxCents,-16);
});
test('payments, already returned deposits and credited returns cannot imply a full cash refund',()=>{
 assert(review(receipt,items,[{method:'card',amount_cents:119}]).issues.some(i=>i.code==='provider_refund'));
 assert(review(receipt,items,[{method:'cash',amount_cents:100}]).issues.some(i=>i.code==='payment_mismatch'));
 assert(review(receipt,items,payments,[{returned_qty:1}]).issues.some(i=>i.code==='deposit_returned'));
 assert(review(receipt,items,payments,[],[{id}]).issues.some(i=>i.code==='credited_return'));
 assert(review({...receipt,order_status:'cancelled'}).issues.some(i=>i.code==='not_paid'));
 for(const amount of [NaN,Infinity,1.5,-1])assert(review(receipt,items,[{method:'cash',amount_cents:amount}]).issues.some(i=>i.code==='payment_mismatch'));
 assert(review(receipt,[],payments).issues.some(i=>i.code==='line_mismatch'));
});
test('mixed VAT deposit totals preserve the original rounded tax amounts',()=>{
 const i=[...items,{product_id:null,product_name_snapshot:'Pfand: A',unit_price_cents:25,tax_rate_snapshot:19,quantity:1},{product_id:null,product_name_snapshot:'Pfand: B',unit_price_cents:25,tax_rate_snapshot:7,quantity:1}];
 const r=review({...receipt,total_cents:169},i,[{method:'cash',amount_cents:169}]);
 assert.deepEqual(r.issues,[]);assert.equal(r.lines.reduce((sum,l)=>sum+l.grossCents,0),-169);
 assert.equal(r.taxRows.reduce((sum,l)=>sum+l.taxCents,0),-25);
 assert(r.taxRows.some(row=>row.rate===null));
});
test('snapshot load is tenant scoped, read only, rolls back failures and always releases',async()=>{
 const calls=[];let released=0;
 const pool={connect:async()=>({release(){released++},query:async(sql,args)=>{calls.push({sql,args});if(sql.includes('FROM receipts')){assert.deepEqual(args,[id,company]);assert.match(sql,/r.company_id=\$2/);return {rows:[{...receipt,order_id:id}]};}if(sql.includes('FROM order_items'))return {rows:items};if(sql.includes('FROM payments'))return {rows:payments};return {rows:[]};}})};
 assert.equal((await loadCancellationReview(pool,{company_id:company},id)).canCancel,false);assert.equal(released,1);
 assert.equal(calls[0].sql,'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');assert.equal(calls.at(-1).sql,'COMMIT');
 assert(!calls.some(c=>/INSERT|UPDATE|DELETE|nextval/.test(c.sql)));
 const failing={connect:async()=>({release(){released++},query:async sql=>{calls.push({sql});if(sql.startsWith('SELECT'))throw Error('read failed');return {rows:[]}}})};
 await assert.rejects(loadCancellationReview(failing,{company_id:company},id),/read failed/);assert.equal(calls.at(-1).sql,'ROLLBACK');assert.equal(released,2);
});
test('review route rejects writes, malformed IDs and unauthorized access before reading invoices',async()=>{
 let reads=0;const pool={connect(){reads++;throw Error('Unexpected invoice read')}};
 const call=async(actor,method='GET',target=id)=>{let status,data;const h=createTradeHandler(pool,async()=>actor);assert(await h({url:'/api/v1/trade/invoices/'+target+'/cancellation-review',method,headers:{}},{writeHead(s){status=s},end(s){data=JSON.parse(s)}}));return {status,data};};
 assert.equal((await call(null)).status,401);assert.equal((await call({role:'waiter'})).status,403);
 for(const method of ['POST','PUT','DELETE'])assert.equal((await call({role:'owner'},method)).status,405);
 assert.equal((await call({role:'manager'},'GET','bad-id')).status,404);assert.equal(reads,0);
});
