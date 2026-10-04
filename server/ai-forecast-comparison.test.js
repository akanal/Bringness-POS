import test from 'node:test';import assert from 'node:assert/strict';import {compareForecast} from './ai-forecast-comparison.js';
const snapshot={day:'2026-10-01',result:{ready:true,expectedOrders:10,ordersBand:{low:7,high:13},recipeMappings:[{stockId:'flour',productCode:'dish',quantity:.2}],suggestions:[{stockId:'flour',name:'Mehl',unit:'kg',expectedUse:2}]}};
test('compares captured recipe quantities to paid items on matching day',()=>{
 const r=compareForecast(snapshot,[{day:snapshot.day,orders:12,revenue_cents:1000}],[{day:snapshot.day,product_code:'dish',quantity:12},{day:'2026-10-02',product_code:'dish',quantity:100}], '2026-10-03');
 assert.equal(r.withinOrdersBand,true);assert.equal(r.ingredients[0].actualUse,2.4);assert.equal(r.ingredients[0].difference,.4);
});
test('today is provisional and legacy ingredients remain unknown',()=>{
 assert.equal(compareForecast(snapshot,[],[],snapshot.day).withinOrdersBand,null);
 assert.equal(compareForecast(snapshot,[],[],snapshot.day).ingredients,null);
 assert.equal(compareForecast({day:snapshot.day,result:{ready:false}},[],[],'2026-10-03').ingredients,null);
});
