import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {createRequire} from 'node:module';import {dependency} from './dependency.mjs';
const require=createRequire(import.meta.url),{JSDOM}=require(dependency('jsdom','SHOP_JSDOM_PATH'));
const [html,baseScript,deviceScript]=await Promise.all(['operations.html','operations.js','device-checks.js'].map(name=>readFile(new URL('../../apps/web/public/pos/'+name,import.meta.url),'utf8')));
const rid='11111111-1111-4111-8111-111111111111',company='22222222-2222-4222-8222-222222222222',pid='33333333-3333-4333-8333-333333333333',when='2026-11-08T02:00:00.000Z',tick=()=>new Promise(r=>setTimeout(r,15));
async function fixture({bind=true}={}){
 const dom=new JSDOM(html,{url:'https://bringness.de/pos/operations.html',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,d=w.document;w.AbortSignal=globalThis.AbortSignal;let lose=false,failList=false,denied=false,hold=false,release=null,prints=0,throwPrint=false,allow=true;
 const posts=[],checks=[],requests=new Map(),downloads=[];w.localStorage.setItem('bringness-pos-token','synthetic-pos');w.localStorage.setItem('bringness-shop-token','separate-shop');w.HTMLElement.prototype.scrollIntoView=function(){};w.print=()=>{if(throwPrint)throw Error('print unavailable');prints++};w.confirm=()=>allow;w.URL.createObjectURL=blob=>{downloads.push(blob);return 'blob:protocol'};w.URL.revokeObjectURL=()=>{};w.HTMLAnchorElement.prototype.click=function(){};
 w.fetch=async(url,options={})=>{
  if(url.endsWith('/bootstrap'))return Response.json({restaurants:[{id:rid,name:'POS Fixture'}]});
  if(url.startsWith('/api/v1/pos-device-checks')){
   if(denied)return Response.json({error:'Betriebskontext geändert',code:'DEVICE_SCOPE_CHANGED'},{status:409});
   if(options.method==='POST'){
    const body=JSON.parse(options.body);posts.push(body);let row=requests.get(body.requestId);if(!row){row={company_id:body.companyId,restaurant_id:body.restaurantId,request_id:body.requestId,event_number:String(checks.length+1),kind:body.kind,label:body.label,outcome:body.outcome,details:structuredClone(body.details),note:body.note,created_at:when,actor_id:pid,actor_label:'=Prüfkonto',evidence_source:'user_report',protocol_version:1};requests.set(body.requestId,row);checks.unshift(row);}
    if(hold)await new Promise(resolve=>{release=resolve});if(lose){lose=false;throw new TypeError('lost response')}
    return Response.json({restaurantId:rid,companyId:company,requestId:body.requestId,check:row});
   }
   if(failList)throw new TypeError('list unavailable');const q=new URL(url,'https://bringness.de').searchParams;let selected=checks.filter(row=>(!q.get('kind')||row.kind===q.get('kind'))&&(!q.get('requestId')||row.request_id===q.get('requestId'))&&(!q.get('cursor')||BigInt(row.event_number)<BigInt(q.get('cursor')))&&(!q.get('asOf')||BigInt(row.event_number)<=BigInt(q.get('asOf'))));return Response.json({restaurantId:rid,companyId:company,asOf:q.get('asOf')||String(checks.length),rows:selected,nextCursor:null});
  }
  if(url.startsWith('/api/v1/pos-inventory/history'))return Response.json({restaurantId:rid,companyId:company,recordingSince:when,asOf:'0',rows:[],nextCursor:null});
  return Response.json({restaurantId:rid,rows:[{id:pid,name:'Artikel',revision:1,counted_units:2,minimum_units:3,target_units:8,counted_at:when}],manualCounts:true});
 };
 w.eval(deviceScript);w.eval(baseScript.replace(/^import .*device-checks.*;\n/,''));const by=id=>d.getElementById(id),input=(id,value)=>{const node=by(id);if(node.type==='checkbox')node.checked=value;else node.value=value;node.dispatchEvent(new w.Event('input',{bubbles:true}));node.dispatchEvent(new w.Event('change',{bubbles:true}));};
 by('load').click();await tick();if(bind){by('device-load').click();await tick();}
 const scan=value=>{input('scan',value);by('scanner').dispatchEvent(new w.Event('submit',{cancelable:true,bubbles:true}));};
 return {w,by,input,scan,posts,checks,downloads,get prints(){return prints},set lose(v){lose=v},set failList(v){failList=v},set denied(v){denied=v},set hold(v){hold=v},get release(){return release},set throwPrint(v){throwPrint=v},set allow(v){allow=v},close(){w.dispatchEvent(new w.Event('pagehide'));w.close()}};
}
test('scanner match needs an explicit user confirmation and saves only a user report',async()=>{
 const f=await fixture();try{
  f.input('device-scanner-label','=Scanner Tresen');f.input('device-scanner-expected','123');f.scan('124');f.input('device-scanner-outcome','user_confirmed');f.by('device-scanner-save').click();await tick();assert.equal(f.posts.length,0);assert.match(f.by('device-status').textContent,/Sollcode/);
  f.scan('123');assert.equal(f.by('device-scanner-outcome').value,'unverified');f.input('device-scanner-outcome','user_confirmed');f.by('device-scanner-save').click();await tick();assert.equal(f.posts.length,1);assert.equal(f.posts[0].details.observedCode,'123');assert.equal(f.checks[0].evidence_source,'user_report');assert.equal(f.w.posOperationsLeaveState().dirty,false);assert.match(f.by('device-status').textContent,/gespeichert/);assert.match(f.by('device-check-list').textContent,/kein automatischer/);assert.equal(f.by('device-scanner-save').disabled,true);
 }finally{f.close()}
});
test('print protocol requires a print request and all explicit paper checks; another print resets them',async()=>{
 const f=await fixture();try{
  f.input('device-printer-label','Bondrucker');f.input('device-printer-width','58');for(const id of ['paper-confirm','device-printer-legible','device-printer-glyphs','device-printer-output'])f.input(id,true);f.input('device-printer-outcome','user_confirmed');f.by('device-printer-save').click();await tick();assert.equal(f.posts.length,0);
  f.by('print').click();assert.equal(f.prints,1);assert.equal(f.by('test-print').style.width,'58mm');assert.equal(f.by('paper-confirm').checked,false);assert.equal(f.by('device-printer-glyphs').checked,false);
  for(const id of ['paper-confirm','device-printer-legible','device-printer-glyphs','device-printer-output'])f.input(id,true);f.input('device-printer-outcome','user_confirmed');f.by('device-printer-save').click();await tick();assert.equal(f.posts.length,1);assert.equal(f.posts[0].details.printRequested,true);assert.equal(f.checks[0].outcome,'user_confirmed');
  f.by('print').click();assert.equal(f.by('device-printer-outcome').value,'unverified');assert.equal(f.by('device-printer-output').checked,false);assert.equal(f.w.posOperationsLeaveState().dirty,true);
 }finally{f.close()}
});
test('lost device acknowledgement freezes the original command and retries without a duplicate',async()=>{
 const f=await fixture();try{
  f.input('device-scanner-label','Scanner');f.input('device-scanner-outcome','problem');f.input('device-scanner-note','Kein Code empfangen');f.lose=true;f.by('device-scanner-save').click();await tick();const original=structuredClone(f.posts[0]);assert.equal(f.checks.length,1);assert.equal(f.w.posOperationsLeaveState().pending,true);assert.equal(f.by('restaurant').disabled,true);assert.equal(f.by('device-scanner-label').disabled,true);assert.equal(f.by('device-discard').disabled,true);
  f.by('device-retry').click();await tick();assert.equal(f.posts.length,2);assert.deepEqual(f.posts[1],original);assert.equal(f.checks.length,1);assert.equal(f.w.posOperationsLeaveState().pending,false);assert.equal(f.w.posOperationsLeaveState().dirty,false);
 }finally{f.close()}
});
test('a confirmed device save remains confirmed when refreshing the list fails',async()=>{
 const f=await fixture();try{
  f.input('device-scanner-label','Noch ungeprüft');f.failList=true;f.by('device-scanner-save').click();await tick();assert.equal(f.checks.length,1);assert.equal(f.checks[0].outcome,'unverified');assert.match(f.by('device-status').textContent,/gespeichert.*Verlauf/);assert.equal(f.w.posOperationsLeaveState().pending,false);assert.equal(f.w.posOperationsLeaveState().dirty,false);assert.equal(f.by('device-check-list').children.length,1);
 }finally{f.close()}
});
test('saved CSV revalidates the original scope and protects formula cells',async()=>{
 const f=await fixture();try{
  f.input('device-scanner-label','=Scanner');f.input('device-scanner-outcome','problem');f.input('device-scanner-note','+Keine Eingabe');f.by('device-scanner-save').click();await tick();f.by('device-check-list').querySelector('button').click();await tick();assert.equal(f.downloads.length,1);const text=await new Promise(resolve=>{const reader=new f.w.FileReader();reader.onload=()=>resolve(reader.result);reader.readAsText(f.downloads[0])});assert(text.includes("'=Scanner"));assert(text.includes("'+Keine Eingabe"));assert(text.includes("'=Prüfkonto"));assert(text.includes('Benutzerangabe'));
  f.denied=true;f.by('device-check-list').querySelector('button').click();await tick();assert.equal(f.downloads.length,1);assert.equal(f.by('device-check-list').children.length,0);assert.equal(f.by('device-scanner-label').value,'');assert.match(f.by('device-status').textContent,/Betriebskontext/);
 }finally{f.close()}
});
test('account change clears device drafts and late save replies cannot restore private data',async()=>{
 const f=await fixture();try{
  f.input('device-scanner-label','Private Eingabe');f.hold=true;f.by('device-scanner-save').click();await tick();assert.equal(typeof f.release,'function');assert.equal(f.w.posOperationsLeaveState().busy,true);f.w.dispatchEvent(new f.w.StorageEvent('storage',{key:'bringness-pos-token'}));f.release();await tick();assert.equal(f.by('device-check-list').children.length,0);assert.equal(f.by('device-scanner-label').value,'');assert.equal(f.by('device-scanner-note').value,'');assert.equal(f.w.localStorage.getItem('bringness-shop-token'),'separate-shop');
 }finally{f.close()}
});
test('device drafts participate in the existing leaving guard and are explicitly discarded',async()=>{
 const f=await fixture();try{
  f.input('device-printer-label','Drucker');assert.equal(f.w.posOperationsLeaveState().dirty,true);assert.equal(f.by('discard-all').disabled,true);assert.equal(f.by('inventory-csv').disabled,false);const event=new f.w.Event('beforeunload',{cancelable:true});f.w.dispatchEvent(event);assert.equal(event.defaultPrevented,true);f.allow=false;f.by('device-discard').click();assert.equal(f.by('device-printer-label').value,'Drucker');f.allow=true;f.by('device-discard').click();assert.equal(f.by('device-printer-label').value,'');assert.equal(f.w.posOperationsLeaveState().dirty,false);assert.equal(f.posts.length,0);
 }finally{f.close()}
});
test('unbound legacy tests still run without creating stored evidence and print failures remain unconfirmed',async()=>{
 const f=await fixture({bind:false});try{
  f.scan('123');assert.match(f.by('scan-result').textContent,/Code empfangen: 123/);assert.equal(f.w.posOperationsLeaveState().dirty,false);f.throwPrint=true;f.by('print').click();assert.match(f.by('print-result').textContent,/konnte nicht/);assert.equal(f.posts.length,0);assert.equal(f.by('device-printer-save').disabled,true);
 }finally{f.close()}
});
