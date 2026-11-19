import {test} from 'node:test';import assert from 'node:assert/strict';
import {shiftDay,historySourceKey,multiYearPattern,applyMultiYearPattern} from './ai-learning-history-core.js';
import {learnForecast} from './ai-forecast-learning.js';
const sale=(day,orders=100,revenueCents=10000)=>({day,orders,revenueCents,quality:'sales'});
test('calendar arithmetic handles leap dates, DST and source cohort changes',()=>{
 assert.equal(shiftDay('2024-02-28',1),'2024-02-29');assert.equal(shiftDay('2026-03-28',2),'2026-03-30');assert.throws(()=>shiftDay('2025-02-29',1));
 const a={pos_company_id:'a',pos_restaurant_id:'b',pos_user_id:'c'},b={...a,pos_restaurant_id:'d'};assert.equal(historySourceKey([a,b,a]),historySourceKey([b,a]));assert.notEqual(historySourceKey([a]),historySourceKey([b]));
});
test('patterns include several seasons across New Year without future or missing data',()=>{
 const days=[];for(let d='2022-01-01';d<'2026-01-01';d=shiftDay(d,1))days.push(sale(d));days.push({...sale('2025-12-31',99999),quality:'unknown'},sale('2026-01-02',99999));
 const p=multiYearPattern(days,'2026-01-02');assert(p.ready);assert(p.seasonalYears.length>=3);assert(p.comparisonDates.some(d=>d.startsWith('2024-12')));assert.equal(p.baseOrders,100);assert(p.comparisonDates.every(d=>d<'2026-01-02'));
 const limited=multiYearPattern(days,'2026-01-02',{comparisonFrom:'2025-12-01'});assert.equal(limited.seasonalDays,0);assert(limited.comparisonDates.every(d=>d>='2025-12-01'));
});
test('old nominal prices do not increase quantities and recent revenue has its own basis',()=>{
 const days=[];for(let d='2022-11-01';d<'2022-12-01';d=shiftDay(d,1))days.push(sale(d,100,5000));for(let d='2026-10-01';d<'2026-11-19';d=shiftDay(d,1))days.push(sale(d,100,15000));
 const p=multiYearPattern(days,'2026-11-19');assert.equal(p.baseOrders,100);assert.equal(p.baseRevenueCents,15000);assert.equal(p.revenueBasis,'recent');
 const r=applyMultiYearPattern({ready:false,pace:1,currentOrders:110,currentRevenueCents:16000},p);assert.equal(r.expectedOrders,110);assert.equal(r.expectedRevenueCents,16000);assert(r.ordersBand.high>=110);
});
test('learning uses years and rejects training outcomes not known before the holdout',()=>{
 const observation={warm:false,rain:false,events:false,thresholds:{v:1}};const rows=Array.from({length:90},(_,i)=>{const day=shiftDay('2023-01-01',i*10);return {day,hour:0,currentOrders:0,baseline:100,actual:120,observation,capturedAt:shiftDay(day,-1)+'T06:00:00Z',actualKnownAt:shiftDay(day,1)+'T06:00:00Z'}});
 const l=learnForecast(rows,observation,'2026-11-19',{requireKnowledgeTime:true});assert(l.available);assert.equal(l.sampleDays,90);
 const bad=rows.map(r=>({...r,actualKnownAt:'2026-11-18T12:00:00Z'}));assert.equal(learnForecast(bad,observation,'2026-11-19',{requireKnowledgeTime:true}).available,false);
});
