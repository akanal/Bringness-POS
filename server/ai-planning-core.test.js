import test from 'node:test';import assert from 'node:assert/strict';
import {distanceKm,validDay,closedOn,validateHours} from './ai-planning-core.js';
import {parseMosmix,unzipKml} from './ai-weather.js';
test('regional radius uses actual coordinates including across the date line',()=>{assert(distanceKm({latitude:52.5,longitude:13.4},{latitude:52.51,longitude:13.4})<2);assert(distanceKm({latitude:52.5,longitude:13.4},{latitude:48.1,longitude:11.5})>400);assert(distanceKm({latitude:0,longitude:179.9},{latitude:0,longitude:-179.9})<23)});
test('opening schedule and exceptional closure validate days and overnight hours',()=>{assert(validDay('2026-10-04'));assert(!validDay('2026-02-30'));const hours=validateHours([null,{open:'18:00',close:'02:00'},null,null,null,null,null]);assert(closedOn('2026-10-04',{hours}));assert(!closedOn('2026-10-05',{hours}));assert(closedOn('2026-10-05',{hours,closedDates:['2026-10-05']}));assert.throws(()=>validateHours([{open:'99:00',close:'11:00'},null,null,null,null,null,null]));assert(!closedOn('2026-10-04',{}))});
const xml=`<dwd:IssueTime>2026-10-03T21:00:00Z</dwd:IssueTime><kml:description>BERLIN</kml:description><kml:coordinates>13.4,52.47,50</kml:coordinates><dwd:TimeStep>2026-10-04T00:00:00Z</dwd:TimeStep><dwd:TimeStep>2026-10-04T01:00:00Z</dwd:TimeStep><dwd:Forecast dwd:elementName="TTT"><dwd:value>283.15 -</dwd:value></dwd:Forecast><dwd:Forecast dwd:elementName="RR1c"><dwd:value>- 0.7</dwd:value></dwd:Forecast>`;
test('DWD converts Kelvin and retains missing and partial values',()=>{const r=parseMosmix(xml,new Date('2026-10-04T00:00:00Z'));assert.equal(r.days[0].minC,10);assert.equal(r.days[0].rainMm,0.7);assert.equal(r.days[0].partial,true);assert.equal(r.station,'BERLIN');assert.equal(r.longitude,13.4)});
test('DWD stale issues and malformed archives are rejected',()=>{assert.throws(()=>parseMosmix(xml,new Date('2026-10-06T00:00:00Z')));assert.throws(()=>unzipKml(Buffer.from('bad')))});

test('closure calendar ignores invalid date collections',()=>{
 assert.equal(closedOn('2026-10-05',{closedDates:42}),false);
 assert.equal(closedOn('2026-10-05',{closedDates:['2026-10-05']}),true);
});

test('closure calendar tolerates invalid hours safely',()=>{
 assert.equal(closedOn('2026-10-05',{hours:{}}),false);
 assert.equal(closedOn('not-a-day',{hours:Array(7).fill(null)}),false);
});

test('invalid dates cannot become exceptional closure days',()=>{
 assert.equal(closedOn('2026-02-30',{closedDates:['2026-02-30']}),false);
});

test('date validation rejects non-string values',()=>{
 for(const value of [null,undefined,0,false,{},[]])assert.equal(validDay(value),false);
});

test('opening hours reject array-shaped and coerced entries',()=>{
 const hours=Array(7).fill(null);
 hours[0]=['10:00','12:00'];
 assert.throws(()=>validateHours(hours),/Öffnungs/);
 hours[0]={open:{toString(){return '10:00'}},close:'12:00'};
 assert.throws(()=>validateHours(hours),/Öffnungs/);
});

test('regional distance rejects missing and invalid coordinates',()=>{
 const berlin={latitude:52.5,longitude:13.4};
 for(const bad of [null,{latitude:91,longitude:13},{latitude:52,longitude:181},{latitude:'52',longitude:13},{latitude:NaN,longitude:13}])assert.throws(()=>distanceKm(berlin,bad),/Koordinaten/);
});

test('opening hours reject unknown properties',()=>{
 const hours=Array(7).fill(null);
 hours[1]={open:'09:00',close:'18:00',unexpected:true};
 assert.throws(()=>validateHours(hours));
});
