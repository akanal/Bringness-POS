import test from 'node:test';
import assert from 'node:assert/strict';
import {approximateDay,berlinClock} from './ai-forecast-core.js';
const clock={date:'2026-10-03',hour:14};
const dateAgo=days=>new Date(Date.parse(clock.date+'T12:00Z')-days*86400000).toISOString().slice(0,10);
const samples=()=>[7,14,21,28,35,42].flatMap(days=>[{day:dateAgo(days),hour:12,orders:10,revenue_cents:10000},{day:dateAgo(days),hour:18,orders:10,revenue_cents:10000}]);
test('same weekdays and historical seasonal comparisons; no precision claim',()=>{const r=approximateDay(samples(),{...clock,hour:0});assert.equal(r.sampleDays,6);assert.equal(r.expectedOrders,20);assert.deepEqual(r.revenueBand,{low:15000,high:25000});assert.equal(r.outlook,'Noch offen');assert.equal(r.history.length,6)});
test('partial hour does not count as completed pace; estimates never below observed sales',()=>{const r=approximateDay([...samples(),{day:clock.date,hour:14,orders:50,revenue_cents:50000}],clock);assert.equal(r.currentOrders,50);assert.equal(r.expectedOrders,50);assert.equal(r.ordersBand.low,50);assert(r.ordersBand.high>=50)});
test('insufficient data stays unknown, empty history is not a confident zero',()=>{const r=approximateDay([],clock);assert.equal(r.ready,false);assert.equal(r.expectedOrders,null);assert.equal(r.revenueBand,null);assert.equal(r.outlook,'Zu wenig Daten')});
test('completed hour pace increases forecast, outliers are bounded',()=>{const r=approximateDay([...samples(),{day:clock.date,hour:12,orders:100,revenue_cents:100000}],clock);assert.equal(r.pace,2);assert.equal(r.expectedOrders,100);assert.equal(r.outlook,'Eher stark')});
test('future data excluded, fallback marked, seasonal samples preserve weekday',()=>{const r=approximateDay([...samples(),{day:dateAgo(364),hour:12,orders:20,revenue_cents:20000},{day:'2026-10-04',hour:12,orders:999,revenue_cents:999000}],clock);assert.equal(r.seasonalDays,1);assert.equal(r.sampleDays,7);assert(!r.history.some(x=>x.date==='2026-10-04'));const fallback=approximateDay([1,2,3].map(d=>({day:dateAgo(d),hour:12,orders:5,revenue_cents:5000})),clock);assert.equal(fallback.fallback,true);assert.equal(fallback.ready,true)});
test('Berlin business date and DST hours are independent of server timezone',()=>{assert.deepEqual(berlinClock(new Date('2026-10-03T22:30:00Z')),{date:'2026-10-04',hour:0});assert.deepEqual(berlinClock(new Date('2026-10-25T01:30:00Z')),{date:'2026-10-25',hour:2})});

test('zero historical completed orders never produces an infinite pace ratio',()=>{
 const history=[7,14,21].flatMap(days=>[{day:dateAgo(days),hour:18,orders:10,revenue_cents:10000}]);
 const result=approximateDay([...history,{day:clock.date,hour:12,orders:3,revenue_cents:3000}],clock);
 assert.equal(result.ready,true);
 assert.equal(result.outlook,'Noch offen');
 assert.equal(result.pace,1);
 assert(Number.isFinite(result.expectedOrders));
});

test('invalid sales rows do not pollute the historical forecast',()=>{
 const valid=samples();
 const corrupt=[null,{day:'2026-02-30',hour:12,orders:999,revenue_cents:999999},{day:dateAgo(7),hour:25,orders:999,revenue_cents:999999},{day:dateAgo(7),hour:12,orders:-1,revenue_cents:999999},{day:dateAgo(7),hour:12,orders:1,revenue_cents:Infinity}];
 const clean=approximateDay(valid,clock);
 const mixed=approximateDay([...valid,...corrupt],clock);
 assert.equal(mixed.expectedOrders,clean.expectedOrders);
 assert.equal(mixed.expectedRevenueCents,clean.expectedRevenueCents);
 assert.equal(approximateDay(null,clock).ready,false);
});

test('coerced text, null and boolean sales figures never count as historical transactions',()=>{
 const valid=samples();
 const bad=[{day:dateAgo(7),hour:'12',orders:500,revenue_cents:50000},{day:dateAgo(7),hour:12,orders:'500',revenue_cents:50000},{day:dateAgo(7),hour:12,orders:500,revenue_cents:'50000'},{day:dateAgo(7),hour:12,orders:null,revenue_cents:50000},{day:dateAgo(7),hour:12,orders:true,revenue_cents:50000}];
 const clean=approximateDay(valid,clock),result=approximateDay([...valid,...bad],clock);
 assert.equal(result.expectedOrders,clean.expectedOrders);
 assert.equal(result.expectedRevenueCents,clean.expectedRevenueCents);
});

test('timestamp-shaped dates cannot silently be interpreted as historical business days',()=>{
 const valid=samples();
 const withTimestamp=[...valid,{day:dateAgo(7)+'T23:30:00Z',hour:12,orders:100000,revenue_cents:10000000}];
 const clean=approximateDay(valid,clock),result=approximateDay(withTimestamp,clock);
 assert.equal(result.expectedOrders,clean.expectedOrders);
 assert.equal(result.expectedRevenueCents,clean.expectedRevenueCents);
});
