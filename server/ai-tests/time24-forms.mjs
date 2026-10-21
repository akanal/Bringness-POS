import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {JSDOM} from 'jsdom';

process.env.TZ='Europe/Berlin';
assert.equal(new Date('2026-10-25T01:30:37Z').getHours(),2);
const w=new JSDOM('<div id="content"></div>',{url:'https://example.org/ai-workspace.html?admin=1',runScripts:'outside-only'}).window;
try{
 w.eval(await fs.readFile(new URL('../../apps/web/public/ai-ads.js',import.meta.url),'utf8'));
 const ad={id:'ad-original',title:'Autumn',status:'quoted',kind:'brand',description:'Test',supplier_name:'Test supplier',delivery_area:'Berlin',fee_cents:1000,starts_at:'2026-10-25T01:30:37.000Z',ends_at:'2026-10-25T01:40:47.000Z',cities:[],postal_prefixes:[],cuisines:[],impressions:0,clicks:0};
 const writes=[],notices=[];
 await w.BringnessAds.render({admin:true,notice:m=>notices.push(m),api:async(path,body)=>{
  if(path==='admin/ads')return {ads:[ad]};assert.equal(path,'admin/ads/quote');writes.push(body);return {};
 }});
 const root=w.document.getElementById('content');
 const form=()=>root.querySelector('[data-ad-form="quote"]');
 const fill=(startDate,startTime,endDate,endTime)=>{const f=form();for(const [key,value]of Object.entries({startsAtDate:startDate,startsAtTime:startTime,endsAtDate:endDate,endsAtTime:endTime}))f.elements[key].value=value;};
 const submit=()=>root.onsubmit({target:form(),preventDefault(){}});
 assert.equal(root.querySelectorAll('input[type="time"],input[type="datetime-local"]').length,0);
 assert.equal(form().elements.startsAtTime.value,'02:30');
 for(const invalid of ['24:00','12:60','9:05','09:05 AM']){fill('2026-10-25',invalid,'2026-10-25','03:30');assert.equal(form().elements.startsAtTime.checkValidity(),false);await submit();assert.equal(writes.length,0);assert.match(notices.at(-1),/HH:MM/);}
 fill('2026-03-29','02:30','2026-03-29','04:00');await submit();assert.equal(writes.length,0);assert.match(notices.at(-1),/Zeitumstellung/);
 fill('2026-02-30','10:00','2026-03-01','12:00');await submit();assert.equal(writes.length,0);
 fill('2026-11-01','22:00','2026-11-01','21:00');await submit();assert.equal(writes.length,0);assert.match(notices.at(-1),/nach dem Beginn/);
 fill('2026-10-25','02:30','2026-10-25','02:40');await submit();assert.equal(writes.length,1);assert.equal(writes[0].startsAt,ad.starts_at);assert.equal(writes[0].endsAt,ad.ends_at);
 fill('2026-10-25','02:31','2026-10-25','02:40');await submit();assert.equal(writes[1].startsAt,'2026-10-25T00:31:00.000Z');assert.equal(writes[1].endsAt,ad.ends_at);
 fill('2026-11-01','23:30','2026-11-02','00:30');await submit();assert.equal(writes[2].startsAt,'2026-11-01T22:30:00.000Z');assert.equal(writes[2].endsAt,'2026-11-01T23:30:00.000Z');
 console.log('24-hour ads form passed: invalid inputs block writes, DST gap, repeated autumn hour preserves UTC/seconds, explicit edits and overnight interval.');
}finally{w.close();}
