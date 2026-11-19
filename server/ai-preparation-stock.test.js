import {test} from 'node:test';
import assert from 'node:assert/strict';
import {preparationStockPlan} from './ai-preparation-stock.js';
const today='2026-11-19';
const stock=[{id:'flour',name:'Mehl',unit:'kg',quantity:'10',reserved_quantity:'2'}];
const day=(date,amounts)=>({date,available:true,items:amounts.map(quantity=>({ingredients:[{stockId:'flour',quantity}]}))});
test('shared ingredients aggregate before consuming reserved-adjusted stock once across days',()=>{
 const input=[day(today,[3,4]),day('2026-11-20',[3])],before=JSON.stringify({input,stock});
 const r=preparationStockPlan(input,stock,[],today);
 assert.deepEqual(r.map(d=>d.items[0].shortage),[0,2]);assert.equal(r[0].items[0].required,7);assert.equal(r[1].items[0].available,1);
 assert.equal(JSON.stringify({input,stock}),before);
});
test('dated deliveries cannot cover yesterday and never invent replenishment for a shortage',()=>{
 const r=preparationStockPlan([day(today,[10]),day('2026-11-20',[4]),day('2026-11-21',[3])],stock,[{stockId:'flour',date:'2026-11-20',quantity:5},{stockId:'flour',date:'2026-11-18',quantity:100},{stockId:'foreign',date:today,quantity:100}],today);
 assert.deepEqual(r.map(d=>d.items[0].shortage),[2,0,2]);assert.deepEqual(r.map(d=>d.items[0].remaining),[0,1,0]);
});
test('integer stock precision prevents phantom shortages and missing stock stays unknown',()=>{
 const r=preparationStockPlan([day(today,[.1,.2])],[{...stock[0],quantity:.3,reserved_quantity:0}],[],today);assert.equal(r[0].items[0].shortage,0);
 for(const quantity of [null,'',NaN,'oops'])assert.equal(preparationStockPlan([day(today,[1])],[{...stock[0],quantity}],[],today)[0].items[0].shortage,null);
 assert.equal(preparationStockPlan([day(today,[1])],[],[],today)[0].items[0].shortage,null);
});
test('unknown days block subsequent allocation while closed days retain unused supplies',()=>{
 const end=day('2026-11-21',[10]);
 assert.equal(preparationStockPlan([{date:today,available:false,items:[]},end],stock,[],today)[1].available,false);
 const r=preparationStockPlan([{date:today,available:false,closed:true,items:[]},end],stock,[{stockId:'flour',date:today,quantity:3}],today);assert.equal(r[1].items[0].available,11);assert.equal(r[1].items[0].shortage,0);
 assert.throws(()=>preparationStockPlan([day(today,[1]),day(today,[2])],stock,[],today),/duplicate/);
});
