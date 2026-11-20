import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizePriceTriggers,priceDecision} from './ai-price-rules.js';

const data={time:'16:30',closing:'17:00',open:false,portions:8,recentOrders:3,forecast:{ready:true,baselineOrders:100,expectedOrders:80}};
test('price triggers respect boundaries and missing evidence',()=>{
 const quiet={kind:'quiet',start:'14:00',end:'17:30',maxOrders:3};
 assert.deepEqual(priceDecision(quiet,data),{kind:'quiet',capMinutes:30});
 assert.equal(priceDecision(quiet,{...data,recentOrders:4}),null);
 assert.equal(priceDecision(quiet,{...data,recentOrders:undefined}),null);
 assert.equal(priceDecision(quiet,{...data,time:'13:59'}),null);
 const surplus={kind:'surplus',beforeClosing:60,portions:8};
 assert.deepEqual(priceDecision(surplus,data),{kind:'surplus',capMinutes:30});
 assert.equal(priceDecision(surplus,{...data,closing:undefined}),null);
 assert.equal(priceDecision(surplus,{...data,portions:7}),null);
 assert.equal(priceDecision(surplus,{...data,closed:true}),null);
 const forecast={kind:'forecast',belowPercent:20};
 assert.equal(priceDecision(forecast,data).kind,'forecast');
 assert.equal(priceDecision(forecast,{...data,forecast:{ready:true,expectedOrders:81,baselineOrders:100}}),null);
 assert.equal(priceDecision(forecast,{...data,forecast:{ready:false,expectedOrders:20,baselineOrders:100}}),null);
 assert.equal(priceDecision({kind:'menu',portions:8},data).kind,'menu');
 assert.equal(priceDecision({kind:'menu',portions:9},data),null);
});
test('operator rules are scoped to selected products and validated',()=>{
 const quiet={kind:'quiet',start:'14:00',end:'17:00',maxOrders:3};
 assert.deepEqual(normalizePriceTriggers({dish:quiet},['dish']),{dish:quiet});
 assert.throws(()=>normalizePriceTriggers({other:quiet},['dish']),{status:400});
 assert.throws(()=>normalizePriceTriggers({dish:{...quiet,end:'13:00'}},['dish']),{status:400});
 assert.throws(()=>normalizePriceTriggers({dish:{kind:'surplus',portions:0,beforeClosing:30}},['dish']),{status:400});
});
