import {test} from 'node:test';import assert from 'node:assert/strict';import {wasteRecommendations,preparationRecommendations} from './ai-kitchen-assistant-core.js';
const today='2026-11-19',stock=[{id:'a',name:'Mehl',unit:'kg',quantity:10,reserved_quantity:0}],lot={id:'lot',stock_id:'a',quantity:10,stock_at_check:10,checked_on:today,expires_on:'2026-11-20',opened_on:null},recipes=[{id:'r',name:'Brot',active:true,external_code:'p',items:[{stock_id:'a',quantity:.5}]}];
test('waste advice requires current lot quantities and real dated information for every ingredient',()=>{
 const r=wasteRecommendations(stock,[lot],recipes,today);assert.equal(r.findings[0].kind,'soon');assert.equal(r.dishes.length,1);
 for(const bad of [{...lot,expires_on:'2026-11-18'},{...lot,expires_on:null},{...lot,opened_on:today},{...lot,checked_on:'2026-11-18'},{...lot,stock_at_check:9},{...lot,movement_at_check:1}])assert.equal(wasteRecommendations(stock,[bad],recipes,today).dishes.length,0);
 assert.equal(wasteRecommendations(stock,[],recipes,today).findings[0].kind,'missing');assert.equal(wasteRecommendations(stock,[lot],[{...recipes[0],items:[...recipes[0].items,{stock_id:'unknown',quantity:1}]}],today).dishes.length,0);
});
test('preparation quantities use product sales separately from revenue and never invent meal splits',()=>{
 const history=['2026-11-01','2026-11-02','2026-11-03'].map(day=>({day,quality:'sales',orders:10,products:[{product_code:'p',quantity:4,hour:12},{product_code:'p',quantity:6,hour:19}]}));const f={ready:true,date:today,comparisonDates:history.map(d=>d.day),expectedOrders:12};
 const r=preparationRecommendations([f],history,recipes)[0];assert.equal(r.items[0].portions,12);assert.equal(r.items[0].before17+r.items[0].from17,12);assert.equal(r.items[0].ingredients[0].quantity,6);
 assert.equal(preparationRecommendations([f],history.map(d=>({...d,products:[{product_code:'p',quantity:10}]})),recipes)[0].items[0].before17,null);
 assert.equal(preparationRecommendations([{...f,closed:true}],history,recipes)[0].available,false);assert.equal(preparationRecommendations([f],history.slice(0,2),recipes)[0].available,false);
});
