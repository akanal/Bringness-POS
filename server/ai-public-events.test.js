import {test} from 'node:test';
import assert from 'node:assert/strict';
import {berlinInstant,normalizePublicEvent,createPublicEventService} from './ai-public-events.js';
const now=new Date('2026-11-19T10:00:00Z'),settings={latitude:52.52,longitude:13.405,radiusKm:10};
const loc={identifier:'L_TEST',status:'location.published',title:{de:'Testsaal'},coordinates:{latitude:'52.52',longitude:'13.405'}};
const event={identifier:'E_TEST',status:'event.published',scheduleStatus:'event.scheduled',schedule:{startDate:'2026-11-20',startTime:'18:00:00',endDate:'2026-11-20',endTime:'21:00:00'},metadata:{updated:'2026-11-18T10:00:00Z'},attractions:[{referenceLabel:{de:'Konzert <script>unsafe</script>'}}],locations:[{referenceId:loc.identifier}]};
const normalize=e=>normalizePublicEvent(e,new Map([[loc.identifier,loc]]),now);
const response=(kind,rows,extra={})=>new Response(JSON.stringify({success:true,data:{[kind]:rows,page:1,pageSize:500,totalCount:rows.length,...extra}}),{headers:{'content-type':'application/json'}});
test('Berlin source dates respect summer/winter offsets and reject DST gaps and ambiguity',()=>{
 assert.equal(berlinInstant('2026-11-20','18:30:00'),'2026-11-20T17:30:00.000Z');assert.equal(berlinInstant('2026-06-20','18:30'),'2026-06-20T16:30:00.000Z');
 for(const [d,t] of [['2026-03-29','02:30'],['2026-10-25','02:30'],['2026-02-30','12:00'],['2026-11-20','24:00']])assert.equal(berlinInstant(d,t),null);
});
test('public events carry a stable occurrence identity, attribution and normalized physical coordinates',()=>{
 const [e]=normalize(event);assert.equal(e.starts_at,'2026-11-20T17:00:00.000Z');assert.equal(e.public,true);assert.equal(e.own,false);assert.equal(e.title.includes('<'),false);assert.equal(e.source,'kulturdaten.berlin');assert.equal(e.latitude,52.52);
 assert.equal(normalize({...event,locations:[...event.locations,...event.locations]}).length,1);
});
test('cancellations and postponements are retained without becoming active demand',()=>{for(const scheduleStatus of ['event.cancelled','event.postponed'])assert.equal(normalize({...event,scheduleStatus})[0].status,'cancelled');});
test('missing venue coordinates use an explicitly approximate known postcode center',()=>{
 const [e]=normalizePublicEvent(event,new Map([[loc.identifier,{...loc,coordinates:undefined,address:{postalCode:'10115'}}]]),now);assert(e.locationApproximate);assert.equal(e.postcode,'10115');assert.equal(typeof e.latitude,'number');
});
test('unknown ends are visibly marked and all-day events end exclusively at next Berlin midnight',()=>{
 const [e]=normalize({...event,schedule:{startDate:'2026-11-20',startTime:'00:00:00',endTime:'00:00:00'}});assert.equal(e.ends_at,'2026-11-20T23:00:00.000Z');assert.equal(e.allDay,true);assert.equal(e.endEstimated,true);
});
test('unpublished, virtual, ungeocoded, invalid and permanent entries are excluded',()=>{
 assert.deepEqual(normalize({...event,status:'event.unpublished'}),[]);assert.deepEqual(normalize({...event,schedule:{...event.schedule,permanentOpening:true}}),[]);
 for(const change of [{isVirtual:true},{coordinates:{}},{coordinates:{latitude:'',longitude:'13'}},{coordinates:{latitude:'100',longitude:'13'}}])assert.deepEqual(normalizePublicEvent(event,new Map([[loc.identifier,{...loc,...change}]]),now),[]);
});
test('one shared catalogue serves concurrent private radius filters and is defensively copied',async()=>{
 let calls=0;const urls=[],service=createPublicEventService({clock:()=>now,fetcher:async url=>{calls++;urls.push(url);return response(url.includes('/locations?')?'locations':'events',url.includes('/locations?')?[loc]:[event]);}});
 const [a,b]=await Promise.all([service(settings),service({...settings,latitude:52.7,radiusKm:1})]);assert.equal(calls,2);assert.equal(a.events.length,1);assert.equal(b.events.length,0);assert(a.available);assert(urls.every(u=>!u.includes('52.52')&&!u.includes('13.405')));
 a.events[0].title='Changed';assert.notEqual((await service(settings)).events[0].title,'Changed');assert.equal(calls,2);
});
test('source failures stay explicit, are briefly cached and retry without serving stale events',async()=>{
 let time=now,fail=true,calls=0;const service=createPublicEventService({clock:()=>time,fetcher:async url=>{calls++;if(fail)throw Error('Unavailable');return response(url.includes('/locations?')?'locations':'events',url.includes('/locations?')?[loc]:[event]);}});
 assert.equal((await service(settings)).available,false);assert.equal((await service(settings)).events.length,0);assert.equal(calls,1);time=new Date(+now+301000);fail=false;assert.equal((await service(settings)).events.length,1);
});
test('overlapping provider pages are deduplicated and explicitly marked as incomplete',async()=>{
 const service=createPublicEventService({clock:()=>now,fetcher:async url=>url.includes('/locations?')?response('locations',[loc]):response('events',[event,event])});
 const r=await service(settings);assert(r.available);assert.equal(r.events.length,1);assert.equal(r.partial,true);assert.equal(r.duplicateCount,1);
});
test('incomplete pagination, excessive totals and wrong media types fail closed',async()=>{
 for(const make of [()=>response('locations',[loc],{totalCount:6001}),()=>response('locations',[loc],{totalCount:2}),()=>new Response('html')]){
  const service=createPublicEventService({clock:()=>now,fetcher:async()=>make()});const r=await service(settings);assert.equal(r.available,false);assert.deepEqual(r.events,[]);
 }
});
test('locations outside source coverage or missing coordinates do not call the provider',async()=>{
 let calls=0;const service=createPublicEventService({fetcher:async()=>{calls++;throw Error();}});assert.equal((await service({})).available,false);assert.equal((await service({...settings,latitude:48.13,longitude:11.58})).available,false);assert.equal(calls,0);
});
