import {test} from 'node:test';import assert from 'node:assert/strict';import {wasteRecommendations,preparationRecommendations} from './ai-kitchen-assistant-core.js';
const today='2026-11-19',stock=[{id:'a',name:'Mehl',unit:'kg',quantity:10,reserved_quantity:0}],lot={id:'lot',stock_id:'a',quantity:10,stock_at_check:10,checked_on:today,expires_on:'2026-11-20',opened_on:null,opening_state:'sealed'},recipes=[{id:'r',name:'Brot',active:true,external_code:'p',items:[{stock_id:'a',quantity:.5}]}];
test('waste advice requires current lot quantities and real dated information for every ingredient',()=>{
 const r=wasteRecommendations(stock,[lot],recipes,today);assert.equal(r.findings[0].kind,'soon');assert.equal(r.dishes.length,1);
 for(const bad of [{...lot,expires_on:'2026-11-18'},{...lot,expires_on:null},{...lot,opening_state:'opened',opened_on:today},{...lot,opening_state:'unknown'},{...lot,checked_on:'2026-11-18'},{...lot,stock_at_check:9},{...lot,movement_at_check:1}])assert.equal(wasteRecommendations(stock,[bad],recipes,today).dishes.length,0);
 assert.equal(wasteRecommendations(stock,[],recipes,today).findings[0].kind,'missing');assert.equal(wasteRecommendations(stock,[lot],[{...recipes[0],items:[...recipes[0].items,{stock_id:'unknown',quantity:1}]}],today).dishes.length,0);
});
test('preparation quantities use product sales separately from revenue and never invent meal splits',()=>{
 const history=['2026-11-01','2026-11-02','2026-11-03'].map(day=>({day,quality:'sales',orders:10,products:[{product_code:'p',quantity:4,hour:12},{product_code:'p',quantity:6,hour:19}]}));const f={ready:true,date:today,comparisonDates:history.map(d=>d.day),expectedOrders:12};
 const r=preparationRecommendations([f],history,recipes)[0];assert.equal(r.items[0].portions,12);assert.equal(r.items[0].before17+r.items[0].from17,12);assert.equal(r.items[0].ingredients[0].quantity,6);
 assert.equal(preparationRecommendations([f],history.map(d=>({...d,products:[{product_code:'p',quantity:10}]})),recipes)[0].items[0].before17,null);
 assert.equal(preparationRecommendations([{...f,closed:true}],history,recipes)[0].available,false);assert.equal(preparationRecommendations([f],history.slice(0,2),recipes)[0].available,false);
});
const windows=[{id:'breakfast',startHour:6,endHour:11},{id:'lunch',startHour:11,endHour:17},{id:'dinner',startHour:17,endHour:0}];
function preparationFixture(products,rs=recipes){const history=[1,2,3].map(n=>({day:`2026-11-0${n}`,quality:'sales',orders:10,products}));return preparationRecommendations([{ready:true,date:today,comparisonDates:history.map(d=>d.day),expectedOrders:11}],history,rs,windows)[0].items[0];}
test('service windows conserve portions and rounded ingredient totals at exact boundaries',()=>{
 const item=preparationFixture([5,6,11,17].map((hour,i)=>({product_code:'p',quantity:i+1,hour})),[{...recipes[0],items:[{stock_id:'a',quantity:.333}]}]);
 assert.equal(item.portions,11);assert.deepEqual(item.serviceWindows.map(w=>w.portions),[2,3,5,1]);
 assert.equal(item.serviceWindows.reduce((s,w)=>s+w.portions,0),item.portions);
 assert.equal(Math.round(item.serviceWindows.reduce((s,w)=>s+w.ingredients[0].quantity,0)*1000),Math.round(item.ingredients[0].quantity*1000));
});
test('overnight windows keep calendar dates and missing hours remain unknown',()=>{
 const history=[1,2,3].map(n=>({day:`2026-11-0${n}`,quality:'sales',orders:10,products:[0,2,3,21,22,23].map(hour=>({product_code:'p',quantity:1,hour}))})),f={ready:true,date:today,comparisonDates:history.map(d=>d.day),expectedOrders:10};
 const r=preparationRecommendations([f],history,recipes,[{id:'dinner',startHour:22,endHour:3}])[0];assert.deepEqual(r.items[0].serviceWindows.map(w=>w.portions),[4,2]);
 for(const hour of [undefined,null,-1,24,12.5,'12'])assert(preparationFixture([{product_code:'p',quantity:5,hour}]).serviceWindows.every(w=>w.portions===null&&w.ingredients===null));
});
test('invalid or overlapping windows are rejected; legacy callers retain their split',async()=>{
 const {normalizeServiceWindows}=await import('./ai-kitchen-assistant-core.js');
 for(const bad of [[],{},[{id:'other',startHour:6,endHour:11}],[{id:'lunch',startHour:6,endHour:6}],[{id:'lunch',startHour:6.5,endHour:11}],[{id:'lunch',startHour:6,endHour:24}],[{id:'dinner',startHour:22,endHour:3},{id:'breakfast',startHour:2,endHour:6}]])assert.throws(()=>normalizeServiceWindows(bad),e=>e.status===400);
 assert.equal(normalizeServiceWindows(null),null);assert.deepEqual(normalizeServiceWindows(windows),windows);
 const history=[1,2,3].map(n=>({day:`2026-11-0${n}`,quality:'sales',orders:10,products:[{product_code:'p',quantity:5,hour:12}]}));assert.equal(preparationRecommendations([{ready:true,date:today,comparisonDates:history.map(d=>d.day),expectedOrders:10}],history,recipes)[0].items[0].serviceWindows,null);
});
test('daily preparation fills gaps with recent dates when the recipe was not sold out',()=>{
 const history=[1,2,3,4,5,6,7,8].map(n=>({
  day:`2026-11-0${n}`,quality:'sales',orders:n>=6?100:10,
  products:[{product_code:'p',quantity:n===1?100:n,hour:12}]
 }));
 const forecast={ready:true,date:today,comparisonDates:history.map(day=>day.day),expectedOrders:10};
 const soldOut=new Map([['r',new Set(history.slice(-3).map(day=>day.day))]]);
 const [item]=preparationRecommendations([forecast],history,recipes,null,soldOut,4)[0].items;
 assert.equal(item.sampleDays,4);
 assert.equal(item.portions,4);
 const insufficient=new Map([['r',new Set(history.slice(2).map(day=>day.day))]]);
 assert.deepEqual(preparationRecommendations([forecast],history,recipes,null,insufficient,4)[0].items,[]);
});
