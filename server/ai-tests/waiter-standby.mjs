import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
const w=new JSDOM(fs.readFileSync(new URL('../../apps/web/public/service/index.html',import.meta.url),'utf8'),{url:'https://example.test/service/',runScripts:'outside-only'}).window;
try{
 w.eval(fs.readFileSync(new URL('../../apps/web/public/service/standby.js',import.meta.url),'utf8'));
 const current=Date.now(),employee={id:'employee-a',restaurant_id:'restaurant-a',restaurant_name:'Restaurant;\nBEGIN:BAD',duty_state:'off'};
 const boot={employee,serverTime:new Date(current).toISOString()},start=current+3600000,end=current+7200000,shift={id:'shift-a',starts_at:new Date(start).toISOString(),ends_at:new Date(end).toISOString(),coverage_state:'planned'};
 const ui=w.bnWaiterStandby,q=id=>w.document.getElementById(id);let rings=0,unlocks=0;w.bnRingWaiterAlarm=()=>rings++;w.bnUnlockWaiterAlarm=()=>unlocks++;
 ui.update(boot,[{...shift,id:'open',coverage_state:'open'},shift]);assert.match(q('shiftCountdown').textContent,/^0[01]:[0-5]\d:[0-5]\d$/);assert.equal(q('armShiftAlarm').disabled,false);
 q('armShiftAlarm').click();assert.equal(unlocks,1);assert.match(q('shiftAlarmStatus').textContent,/aktiviert/);
 const calendar=ui.calendar();assert.match(calendar,/TRIGGER:-PT15M/);assert.match(calendar,/DTSTART:\d{8}T\d{6}Z/);assert.equal((calendar.match(/BEGIN:VEVENT/g)||[]).length,1);assert(!calendar.includes('\r\nBEGIN:BAD'));assert(calendar.endsWith('\r\n'));for(const line of calendar.split('\r\n'))assert(Buffer.byteLength(line)<=75);
 ui.update({...boot,serverTime:new Date(start-14*60000).toISOString()},[shift]);assert.equal(rings,1);ui.render();ui.render();assert.equal(rings,1);
 ui.update({...boot,serverTime:new Date(start+1000).toISOString()},[shift]);assert.equal(q('shiftCountdown').textContent,'00:00:00');assert.match(q('shiftState').textContent,/an der Kasse einstempeln/);assert.equal(employee.duty_state,'off');assert.equal(q('exportShiftAlarm').disabled,true);assert.throws(()=>ui.calendar(),/zukünftiger/);
 ui.update({...boot,serverTime:new Date(end+1000).toISOString()},[shift]);assert.equal(q('shiftCountdown').textContent,'--:--:--');assert.equal(q('armShiftAlarm').disabled,true);
 ui.update({...boot,employee:{...employee,id:'employee-b'}},[shift]);assert.match(q('shiftAlarmStatus').textContent,/ausgeschaltet/);
 ui.update(boot,[], 'network');assert.match(q('shiftState').textContent,/nicht erreichbar/);assert.equal(q('exportShiftAlarm').disabled,true);
 ui.clear();assert.equal(q('shiftCountdown').textContent,'--:--:--');
 console.log('Waiter standby passed: scoped settings, server-based countdown, zero without stamping, expired/open shifts, single alarm, escaped UTC calendar with VALARM and unavailable schedule.');
}finally{w.close();}
