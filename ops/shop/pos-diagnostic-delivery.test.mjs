import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {JSDOM} from 'jsdom';
const delivery=await readFile(new URL('../../apps/web/public/pos/diagnostic-delivery.js',import.meta.url),'utf8'),diagnostics=await readFile(new URL('../../apps/web/public/pos/diagnostics.js',import.meta.url),'utf8');
const rid='11111111-1111-4111-8111-111111111111',tick=()=>new Promise(resolve=>setImmediate(resolve));
function fixture({token='private-session',online=true}={}){
 const w=new JSDOM('<div id="auth"></div><select id="restaurant"><option value="'+rid+'">Fixture</option></select>',{url:'https://pos.test/pos/?secret=never-send',runScripts:'outside-only',pretendToBeVisual:true}).window;
 let time=Date.now(),connected=online;w.Date.now=()=>time;Object.defineProperty(w.navigator,'onLine',{get:()=>connected});if(token)w.localStorage.setItem('bringness-pos-token',token);
 const calls=[];w.fetch=async(url,options)=>{calls.push({url,options,payload:JSON.parse(options.body)});return {status:202,ok:true};};w.eval(delivery);w.eval(diagnostics);
 return {w,calls,report:(scope='STOCK',kind='NETWORK')=>w.bnPosDiagnostics.report(scope,kind),set online(v){connected=v;},advance(ms){time+=ms;},close:()=>w.close()};
}
test('normal screens send no report; a real technical error exports only the strict technical envelope',async()=>{
 const f=fixture();try{await tick();assert.equal(f.w.document.getElementById('posDiagnostic'),null);assert.equal(f.calls.length,0);
 f.report('LOGIN','AUTH');f.report('SAVE','REQUEST');await tick();assert.equal(f.calls.length,0);f.w.bnPosDiagnostics.clear();f.report();await tick();
 assert.equal(f.calls.length,1);const c=f.calls[0];assert.equal(c.url,'/api/v1/pos-diagnostics');assert.equal(c.options.method,'POST');assert.equal(c.options.headers.authorization,'Bearer private-session');
 assert.deepEqual(Object.keys(c.payload).sort(),['code','eventId','online','restaurantId','version']);assert.equal(c.payload.restaurantId,rid);assert.equal(c.payload.code,'POS-STOCK-NETWORK');assert(!JSON.stringify(c.payload).includes('private'));assert(!JSON.stringify(c.payload).includes('secret'));assert.equal(f.w.localStorage.length,1);
 f.report();await tick();assert.equal(f.calls.length,1,'two-minute burst suppression');}finally{f.close();}
});
test('pre-login errors remain local and never create anonymous admin reports',async()=>{const f=fixture({token:null});try{f.report('LOGIN','NETWORK');await tick();assert.equal(f.calls.length,0);assert(f.w.document.getElementById('posDiagnostic'));}finally{f.close();}});
test('offline diagnostics send after reconnect, but business/session changes discard the queue',async()=>{
 for(const change of [null,'business','session']){const f=fixture({online:false});try{f.report();await tick();assert.equal(f.calls.length,0);if(change==='business')f.w.document.getElementById('restaurant').dispatchEvent(new f.w.Event('change'));if(change==='session')f.w.localStorage.setItem('bringness-pos-token','another-session');f.online=true;f.w.dispatchEvent(new f.w.Event('online'));await tick();assert.equal(f.calls.length,change?0:1);}finally{f.close();}}
});
test('delivery failures are silent and retry the identical event only on a later connection event',async()=>{
 const f=fixture();try{let count=0;f.w.fetch=async(url,options)=>{f.calls.push({url,payload:JSON.parse(options.body)});if(count++===0)throw new f.w.TypeError('private network error');return {ok:true,status:202};};f.report();await tick();assert.equal(f.calls.length,1);assert.match(f.w.document.getElementById('posDiagnostic').textContent,/POS-STOCK-NETWORK/);
 f.advance(31000);f.w.dispatchEvent(new f.w.Event('online'));await tick();assert.equal(f.calls.length,2);assert.deepEqual(f.calls[0].payload,f.calls[1].payload);assert(f.calls.every(c=>c.url==='/api/v1/pos-diagnostics'));}finally{f.close();}
});
test('memory queue is capped, expires and never persists diagnostics',async()=>{
 const f=fixture({online:false});try{for(const scope of ['LOAD','SAVE','STOCK','TRADE','TAX'])for(const kind of ['NETWORK','TIMEOUT','RESPONSE','SERVER','STORAGE'])f.report(scope,kind);f.online=true;f.w.dispatchEvent(new f.w.Event('online'));await tick();assert.equal(f.calls.length,20);assert.equal(f.w.localStorage.length,1);}finally{f.close();}
 const expired=fixture({online:false});try{expired.report();expired.advance(900001);expired.online=true;expired.w.dispatchEvent(new expired.w.Event('online'));await tick();assert.equal(expired.calls.length,0);}finally{expired.close();}
});
test('an invalid session stops reporting until a different authenticated session is available',async()=>{
 const f=fixture();try{f.w.fetch=async(url,options)=>{f.calls.push({url,options});return {ok:false,status:401};};f.report();await tick();f.report('TRADE');await tick();assert.equal(f.calls.length,1);f.w.localStorage.setItem('bringness-pos-token','new-session');f.w.fetch=async(url,options)=>{f.calls.push({url,options});return {ok:true,status:202};};f.report('TRADE');await tick();assert.equal(f.calls.length,2);assert.equal(f.calls[1].options.headers.authorization,'Bearer new-session');}finally{f.close();}
});
test('online retry is bounded to three identical attempts and does not require another user action',async()=>{
 const f=fixture();try{
  const native=f.w.setTimeout.bind(f.w),pending=[];f.w.setTimeout=(fn,ms)=>ms===30000?(pending.push(fn),123):native(fn,ms);
  f.w.fetch=async(url,options)=>{f.calls.push({url,payload:JSON.parse(options.body)});throw new f.w.TypeError('offline');};f.report();await tick();assert.equal(f.calls.length,1);
  for(let i=0;i<3;i++){f.advance(31000);assert(pending.length);pending.shift()();await tick();}
  assert.equal(f.calls.length,3);assert.equal(pending.length,0);assert(f.calls.every(c=>c.payload.eventId===f.calls[0].payload.eventId));assert.equal(f.w.localStorage.length,1);
 }finally{f.close();}
});

test('a background connection fault reaches admin without replacing the operator action code',async()=>{
 const f=fixture();try{f.report('SAVE','REQUEST');f.report('CONNECTION','SERVER');await tick();assert.equal(f.calls.length,1);assert.equal(f.calls[0].payload.code,'POS-CONNECTION-SERVER');assert.match(f.w.document.getElementById('posDiagnostic').textContent,/POS-SAVE-REQUEST/);}finally{f.close();}
});
