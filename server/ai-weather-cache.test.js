import test from 'node:test';
import assert from 'node:assert/strict';
import {createWeatherService,archiveCrc32} from './ai-weather.js';
function kmz(issue,start){
 const points=Array.from({length:24},(_,i)=>new Date(Date.parse(start)+i*3600000).toISOString());
 const xml='<dwd:IssueTime>'+issue+'</dwd:IssueTime>'+points.map(t=>'<dwd:TimeStep>'+t+'</dwd:TimeStep>').join('')+'<dwd:Forecast dwd:elementName="TTT"><dwd:value>'+points.map(()=>290).join(' ')+'</dwd:value></dwd:Forecast><dwd:Forecast dwd:elementName="RR1c"><dwd:value>'+points.map(()=>0).join(' ')+'</dwd:value></dwd:Forecast>';
 const name=Buffer.from('forecast.kml'),data=Buffer.from(xml),local=Buffer.alloc(30),central=Buffer.alloc(46),end=Buffer.alloc(22),crc=archiveCrc32(data);
 local.writeUInt32LE(0x04034b50);local.writeUInt32LE(crc,14);local.writeUInt32LE(data.length,18);local.writeUInt32LE(data.length,22);local.writeUInt16LE(name.length,26);
 central.writeUInt32LE(0x02014b50);central.writeUInt32LE(crc,16);central.writeUInt32LE(data.length,20);central.writeUInt32LE(data.length,24);central.writeUInt16LE(name.length,28);
 end.writeUInt32LE(0x06054b50);end.writeUInt16LE(1,10);end.writeUInt32LE(central.length+name.length,12);end.writeUInt32LE(local.length+name.length+data.length,16);
 return Buffer.concat([local,name,data,central,name,end]);
}
test('cached weather cannot cross the issue age boundary and callers cannot mutate stored forecasts',async()=>{
 let now=new Date('2026-10-16T10:00:00Z'),calls=0;const archive=kmz('2026-10-14T22:10:00Z','2026-10-15T22:00:00Z');
 const weather=createWeatherService({clock:()=>now,fetcher:async()=>{calls++;return new Response(archive);}});
 const first=await weather('10384');assert.equal(first.available,true);first.days.length=0;assert.equal((await weather('10384')).days.length,1);assert.equal(calls,1);
 now=new Date('2026-10-16T10:20:00Z');assert.equal((await weather('10384')).available,false);assert.equal(calls,2);
});
test('cached forecasts are refreshed at the Berlin day boundary even inside the one-hour TTL',async()=>{
 let now=new Date('2026-10-16T21:50:00Z'),calls=0;
 const weather=createWeatherService({clock:()=>now,fetcher:async()=>{calls++;return new Response(kmz(now.toISOString(),calls===1?'2026-10-15T22:00:00Z':'2026-10-16T22:00:00Z'));}});
 assert.equal((await weather('10384')).days[0].date,'2026-10-16');now=new Date('2026-10-16T22:10:00Z');assert.equal((await weather('10384')).days[0].date,'2026-10-17');assert.equal(calls,2);
});
test('weather requests are deduplicated and globally bounded; synchronous failures recover',async()=>{
 let resolve,calls=0,now=new Date('2026-10-16T10:00:00Z');const archive=kmz(now.toISOString(),'2026-10-15T22:00:00Z');
 const weather=createWeatherService({maxConcurrent:1,clock:()=>now,fetcher:()=>{calls++;return new Promise(r=>{resolve=r;});}});
 const first=weather('10384'),same=weather('10384');await new Promise(r=>setImmediate(r));assert.equal(calls,1);assert.equal((await weather('10385')).available,false);resolve(new Response(archive));assert.equal((await first).available,true);assert.equal((await same).available,true);
 let failures=0;const broken=createWeatherService({clock:()=>now,fetcher:()=>{failures++;throw Error('private transport detail');}});assert.equal((await broken('10384')).available,false);now=new Date(+now+6*60000);assert.equal((await broken('10384')).available,false);assert.equal(failures,2);
});
test('oversized weather streams are canceled and release their reader',async()=>{
 let canceled=0,released=0;const weather=createWeatherService({fetcher:async()=>({ok:true,body:{getReader:()=>({read:async()=>({done:false,value:new Uint8Array(2000001)}),cancel:async()=>{canceled++;},releaseLock(){released++;}})}})});
 assert.equal((await weather('10384')).available,false);assert.equal(canceled,1);assert.equal(released,1);
});
