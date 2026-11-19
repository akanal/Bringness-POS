import {test} from 'node:test';
import assert from 'node:assert/strict';
import {forecastObservation,learnForecast,applyLearnedForecast} from './ai-forecast-learning.js';
const today='2026-11-19',observation={warm:false,rain:false,events:false,thresholds:{warmC:25,rainMm:5,publicEventDemand:false}};
const samples=(n=60,actual=120)=>Array.from({length:n},(_,i)=>({day:new Date(Date.parse(today+'T12:00:00Z')-(n-i)*86400000).toISOString().slice(0,10),hour:6,currentOrders:0,baseline:100,actual,observation:structuredClone(observation)}));
const forecast={ready:true,progress:0,pace:1,currentOrders:0,currentRevenueCents:0,expectedOrders:100,expectedRevenueCents:10000,ordersBand:{low:75,high:125},revenueBand:{low:7500,high:12500}};
test('learning remains neutral with sparse, future, late or changed-threshold observations',()=>{
 assert.equal(learnForecast(samples(41),observation,today).available,false);
 const bad=[...samples(20),...samples(60).map(s=>({...s,hour:10})),...samples(60).map(s=>({...s,day:today})),...samples(60).map(s=>({...s,currentOrders:1}))];assert.equal(learnForecast(bad,observation,today).sampleDays,20);
 assert.equal(learnForecast(samples(),{...observation,thresholds:{...observation.thresholds,warmC:30}},today).sampleDays,0);
});
test('chronological holdout validates a useful bounded correction without training on its own evaluation',()=>{
 const l=learnForecast(samples(),observation,today);assert(l.available);assert.equal(l.trainingDays,40);assert.equal(l.validationDays,20);assert(l.trainedThrough<l.validatedThrough);assert(l.improvementPercent>=5);assert(l.factor>1&&l.factor<=1.25);
 const r=applyLearnedForecast(forecast,l,true);assert(r.learning.applied);assert(r.expectedOrders>100);assert.equal(applyLearnedForecast(forecast,l,false).expectedOrders,100);
});
test('a correction that fails withheld days or does not improve the original is not offered',()=>{
 assert.equal(learnForecast(samples(60,100),observation,today).available,false);
 const rows=samples();rows.slice(40).forEach(s=>s.actual=80);assert.equal(learnForecast(rows,observation,today).available,false);
});
test('context coefficients need both exposed and unexposed training days',()=>{
 const rows=samples(90);rows.forEach((s,i)=>{s.observation.warm=i%2===0;s.actual=s.observation.warm?125:100;});const l=learnForecast(rows,observation,today);assert(l.available);assert(l.learnedFeatures.includes('warm'));assert(!l.learnedFeatures.includes('rain'));assert(l.coefficients[1]>0);
 assert.equal(learnForecast(rows,{...observation,warm:null},today).available,false);
});
test('daily duplicates, invalid numbers, unknown weather and current-day outcomes never expand evidence',()=>{
 const rows=samples();assert.equal(learnForecast([...rows,...rows,{...rows[0],baseline:NaN},{...rows[0],actual:-1},{...rows[0],day:today}],observation,today).sampleDays,60);
 assert.equal(learnForecast(rows.map(s=>({...s,observation:{...s.observation,rain:null}})),observation,today).available,false);
});
test('PostgreSQL JSONB object key reordering does not discard matching model evidence',()=>{
 const rows=samples().map(s=>({...s,observation:{...s.observation,thresholds:Object.fromEntries(Object.entries(s.observation.thresholds).reverse())}}));assert.equal(learnForecast(rows,observation,today).sampleDays,60);assert(learnForecast(rows,observation,today).available);
});
test('learned and manual coefficients never stack; observed sales and late-day progress dominate',()=>{
 const l={available:true,factor:1.2};const r=applyLearnedForecast({...forecast,pace:1.5,expectedOrders:150,expectedRevenueCents:15000,demand:{rawFactor:1.5}},l,true);assert.equal(r.expectedOrders,120);assert.equal(r.pace,1.2);
 assert.equal(applyLearnedForecast({...forecast,progress:1},l,true).expectedOrders,100);
 const floor=applyLearnedForecast({...forecast,currentOrders:99,currentRevenueCents:9999},{available:true,factor:.75},true);assert.equal(floor.expectedOrders,99);assert.equal(floor.expectedRevenueCents,9999);assert(floor.ordersBand.low<=floor.expectedOrders);assert.equal(applyLearnedForecast({...forecast,ready:false},l,true).learning.applied,false);
});
test('observations distinguish unknown weather, declined public-event effects and source failure',()=>{
 const context={settings:{demandRules:observation.thresholds},events:[],weather:{available:false}};assert.equal(forecastObservation(context,today).warm,null);assert.equal(forecastObservation(context,today).events,false);
 assert.equal(forecastObservation({...context,settings:{...context.settings,publicEventDemand:true}},today).events,null);
 const e={id:'public',public:true,status:'active',starts_at:today+'T10:00:00Z',ends_at:today+'T20:00:00Z'};assert.equal(forecastObservation({...context,events:[e]},today).events,false);
});
