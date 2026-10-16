import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMosmix} from './ai-weather.js';
import {demandEffect} from './ai-demand-core.js';

function forecast(start,hours,{omit=[],duplicate=false,missingRain=false}={}){
 const points=Array.from({length:hours},(_,i)=>new Date(Date.parse(start)+i*3600000).toISOString()).filter((_,i)=>!omit.includes(i));
 if(duplicate)points.push(points[0]);
 const xml=`<dwd:IssueTime>${start}</dwd:IssueTime>`+
  points.map(t=>`<dwd:TimeStep>${t}</dwd:TimeStep>`).join('')+
  `<dwd:Forecast dwd:elementName="TTT"><dwd:value>${points.map(()=>303.15).join(' ')}</dwd:value></dwd:Forecast>`+
  `<dwd:Forecast dwd:elementName="RR1c"><dwd:value>${points.map((_,i)=>missingRain&&i===0?'-':1).join(' ')}</dwd:value></dwd:Forecast>`;
 return parseMosmix(xml,new Date(start));
}

test('complete normal, spring and autumn Berlin days use 24, 23 and 25 distinct hours',()=>{
 for(const [start,hours,date] of [
  ['2026-10-15T22:00:00Z',24,'2026-10-16'],
  ['2026-03-28T23:00:00Z',23,'2026-03-29'],
  ['2026-10-24T22:00:00Z',25,'2026-10-25']
 ]){
  const [day]=forecast(start,hours).days;
  assert.equal(day.date,date);
  assert.equal(day.hours,hours);
  assert.equal(day.partial,false);
  assert.equal(day.rainMm,hours);
 }
});

test('missing hours, duplicates and missing measurements cannot enable weather demand rules',()=>{
 for(const options of [{omit:[12]},{omit:[12],duplicate:true},{duplicate:true},{missingRain:true}]){
  const weather=forecast('2026-10-15T22:00:00Z',24,options);
  assert.equal(weather.days[0].partial,true);
  const effect=demandEffect('2026-10-16',{settings:{demandRules:{enabled:true,warmPercent:50,rainPercent:-20}},weather,events:[]});
  assert.equal(effect.factor,1);
  assert.deepEqual(effect.adjustments,[]);
 }
});

test('autumn day with only 24 hours remains incomplete',()=>{
 const weather=forecast('2026-10-24T22:00:00Z',25,{omit:[3]});
 assert.equal(weather.days[0].hours,24);
 assert.equal(weather.days[0].partial,true);
});


test('weather parser rejects measurement arrays that do not match timestamps',()=>{
 const start='2026-10-15T22:00:00Z';
 const xml='<dwd:IssueTime>'+start+'</dwd:IssueTime><dwd:TimeStep>'+start+'</dwd:TimeStep>'+
 '<dwd:Forecast dwd:elementName="TTT"><dwd:value>303.15 304.15</dwd:value></dwd:Forecast>'+
 '<dwd:Forecast dwd:elementName="RR1c"><dwd:value>1</dwd:value></dwd:Forecast>';
 assert.throws(()=>parseMosmix(xml,new Date(start)),/measurement count mismatch/);
});


test('weather parser rejects malformed timestamps rather than silently omitting them',()=>{
 const start='2026-10-15T22:00:00Z';
 const xml='<dwd:IssueTime>'+start+'</dwd:IssueTime><dwd:TimeStep>not-a-date</dwd:TimeStep>'+
 '<dwd:Forecast dwd:elementName="TTT"><dwd:value>303.15</dwd:value></dwd:Forecast>'+
 '<dwd:Forecast dwd:elementName="RR1c"><dwd:value>1</dwd:value></dwd:Forecast>';
 assert.throws(()=>parseMosmix(xml,new Date(start)),/Invalid forecast timestamp/);
});


test('invalid DWD station coordinates are not exposed as plausible locations',()=>{
 const start='2026-10-15T22:00:00Z';
 const xml='<dwd:IssueTime>'+start+'</dwd:IssueTime><dwd:TimeStep>'+start+'</dwd:TimeStep>'+
 '<dwd:Forecast dwd:elementName="TTT"><dwd:value>303.15</dwd:value></dwd:Forecast>'+
 '<dwd:Forecast dwd:elementName="RR1c"><dwd:value>1</dwd:value></dwd:Forecast>'+
 '<kml:coordinates>999,999</kml:coordinates>';
 const result=parseMosmix(xml,new Date(start));
 assert.equal(result.latitude,null);assert.equal(result.longitude,null);
});


test('weather parser rejects invalid evaluation clocks',()=>{
 const start='2026-10-15T22:00:00Z';
 const xml='<dwd:IssueTime>'+start+'</dwd:IssueTime><dwd:TimeStep>'+start+'</dwd:TimeStep>'+
 '<dwd:Forecast dwd:elementName="TTT"><dwd:value>303.15</dwd:value></dwd:Forecast>'+
 '<dwd:Forecast dwd:elementName="RR1c"><dwd:value>1</dwd:value></dwd:Forecast>';
 for(const invalid of [new Date(NaN),null])assert.throws(()=>parseMosmix(xml,invalid),/Forecast stale/);
});


test('invalid calendar event dates do not break demand forecast evaluation',()=>{
 const context={settings:{demandRules:{enabled:true,eventPercent:30}},events:[
  {id:'bad',status:'active',starts_at:'not-a-date',ends_at:'2026-10-18T00:00:00Z'},
  {id:'reversed',status:'active',starts_at:'2026-10-18T00:00:00Z',ends_at:'2026-10-17T00:00:00Z'}
 ]};
 const effect=demandEffect('2026-10-17',context);
 assert.equal(effect.factor,1);assert.deepEqual(effect.adjustments,[]);
});


test('invalid progress produces a finite demand factor',()=>{
 const context={settings:{demandRules:{enabled:true,eventPercent:30}},events:[{id:'event',status:'active',starts_at:'2026-10-16T10:00:00Z',ends_at:'2026-10-17T10:00:00Z'}]};
 const effect=demandEffect('2026-10-16',context,Number.NaN);
 assert.equal(effect.factor,1.3);
});


test('malformed weather day collection cannot influence demand',()=>{
 const effect=demandEffect('2026-10-16',{settings:{demandRules:{enabled:true,warmPercent:40}},weather:{available:true,days:{date:'2026-10-16',maxC:35}}});
 assert.equal(effect.factor,1);
 assert.deepEqual(effect.adjustments,[]);
});


test('non-array event collections do not influence demand',()=>{
 const effect=demandEffect('2026-10-16',{settings:{demandRules:{enabled:true,eventPercent:30}},events:{status:'active'}});
 assert.equal(effect.factor,1);
 assert.deepEqual(effect.adjustments,[]);
});


test('weather availability must be explicitly true',()=>{
 const effect=demandEffect('2026-10-16',{settings:{demandRules:{enabled:true,warmPercent:40}},weather:{available:'true',days:[{date:'2026-10-16',partial:false,maxC:35}]}});
 assert.equal(effect.factor,1);
 assert.deepEqual(effect.adjustments,[]);
});


test('non-string event timestamps do not adjust demand',()=>{
 const effect=demandEffect('2026-10-16',{settings:{demandRules:{enabled:true,eventPercent:30}},events:[{id:'bad',status:'active',starts_at:0,ends_at:'2026-10-17T10:00:00Z'}]});
 assert.equal(effect.factor,1);
 assert.deepEqual(effect.adjustments,[]);
});


test('invalid weather day records are ignored',()=>{
 const context={settings:{demandRules:{enabled:true,warmPercent:40}},weather:{available:true,days:[null,'2026-10-16',{date:'2026-10-17',partial:false,maxC:35}]}};
 const effect=demandEffect('2026-10-16',context);
 assert.equal(effect.factor,1);
 assert.deepEqual(effect.adjustments,[]);
});


test('events without identifiers cannot change demand',()=>{
 const context={settings:{demandRules:{enabled:true,eventPercent:30}},events:[{status:'active',starts_at:'2026-10-16T10:00:00Z',ends_at:'2026-10-17T10:00:00Z'}]};
 const effect=demandEffect('2026-10-16',context);
 assert.equal(effect.factor,1);
 assert.deepEqual(effect.adjustments,[]);
});
