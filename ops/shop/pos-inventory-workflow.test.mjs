import {test} from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {createRequire} from 'node:module';import {dependency} from './dependency.mjs';
const require=createRequire(import.meta.url),{JSDOM}=require(dependency('jsdom','SHOP_JSDOM_PATH'));
const html=await readFile(new URL('../../apps/web/public/pos/operations.html',import.meta.url),'utf8'),script=await readFile(new URL('../../apps/web/public/pos/operations.js',import.meta.url),'utf8');
const restaurant='11111111-1111-4111-8111-111111111111',a='22222222-2222-4222-8222-222222222222',b='33333333-3333-4333-8333-333333333333',c='44444444-4444-4444-8444-444444444444',date='2026-11-07T10:00:00Z',tick=()=>new Promise(r=>setTimeout(r,15));
async function fixture({history}={}){
 const dom=new JSDOM(html,{url:'https://bringness.de/pos/operations.html',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,doc=w.document;w.AbortSignal=globalThis.AbortSignal;let printed=0,confirm=true,failRead=false,loseAck=false;
 const posts=[],downloads=[],historyCalls=[];let rows=[{id:a,name:'Äpfel',revision:1,counted_units:5,minimum_units:3,target_units:10,counted_at:date},{id:b,name:'=Rolle',revision:null,counted_units:null,minimum_units:null,target_units:null,counted_at:null},{id:c,name:'Kleine Tasse',revision:1,counted_units:0,minimum_units:0,target_units:4,counted_at:date}];
 w.localStorage.setItem('bringness-pos-token','synthetic-pos');w.localStorage.setItem('bringness-shop-token','separate-shop');w.HTMLElement.prototype.scrollIntoView=function(){};w.confirm=()=>confirm;w.print=()=>printed++;w.URL.createObjectURL=blob=>{downloads.push(blob);return 'blob:synthetic'};w.URL.revokeObjectURL=()=>{};w.HTMLAnchorElement.prototype.click=function(){};
 const receipts=new Map();
 w.fetch=async(url,o={})=>{if(url.startsWith('/api/v1/pos-inventory/history?')){const params=new URL(url,'https://bringness.de').searchParams;historyCalls.push(Object.fromEntries(params));return history?history(params,historyCalls):Response.json({restaurantId:restaurant,companyId:restaurant,recordingSince:date,asOf:'0',rows:[],nextCursor:null});}if(url.endsWith('/bootstrap'))return Response.json({restaurants:[{id:restaurant,name:'Testbetrieb'}]});
  if(o.method==='POST'){const command=JSON.parse(o.body);posts.push(command);if(receipts.has(command.requestId))return Response.json(receipts.get(command.requestId));const row=rows.find(r=>r.id===command.productId);if((row.revision||0)!==command.expectedRevision)return Response.json({error:'Zählstand wurde geändert. Bitte neu laden.'},{status:409});Object.assign(row,{revision:command.expectedRevision+1,counted_units:command.countedUnits,minimum_units:command.minimumUnits,target_units:command.targetUnits,counted_at:date});const ack={requestId:command.requestId,productId:row.id,revision:row.revision};receipts.set(command.requestId,ack);if(loseAck){loseAck=false;throw new TypeError('response lost')}return Response.json(ack)}
  if(failRead)throw new TypeError('read failed');return Response.json({restaurantId:restaurant,rows:structuredClone(rows),manualCounts:true});
 };
 w.eval(script);doc.getElementById('load').click();await tick();const by=id=>doc.getElementById(id),card=id=>doc.querySelector('[data-product-id="'+id+'"]');
 const edit=(id,key,value)=>{const input=card(id).querySelector('[name='+key+']');input.value=value;input.dispatchEvent(new w.Event('input',{bubbles:true}))};
 const save=id=>card(id).querySelector('form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
 return {w,by,card,edit,save,posts,downloads,historyCalls,get rows(){return rows},set rows(value){rows=value},get printed(){return printed},set confirm(value){confirm=value},set failRead(value){failRead=value},set loseAck(value){loseAck=value},close(){w.dispatchEvent(new w.Event('pagehide'));w.close()}};
}
test('search and status filters use saved counts and preserve hidden unsaved/invalid input',async()=>{
 const f=await fixture();try{assert.match(f.by('inventory-summary').textContent,/2 gezählt.*1 ungezählt.*1 am Mindestbestand/);f.edit(a,'countedUnits','');f.by('inventory-query').value='rolle';f.by('inventory-query').dispatchEvent(new f.w.Event('input'));assert.equal(f.card(a).hidden,true);assert.equal(f.card(b).hidden,false);f.by('inventory-query').value='apfel';f.by('inventory-query').dispatchEvent(new f.w.Event('input'));assert.equal(f.card(a).hidden,false);assert.equal(f.card(a).querySelector('[name=countedUnits]').value,'');assert.equal(f.by('export').disabled,true);assert.equal(f.by('restaurant').disabled,true);f.by('inventory-filter').value='uncounted';f.by('inventory-filter').dispatchEvent(new f.w.Event('change'));assert.equal(f.card(a).hidden,true);assert.equal(f.by('inventory-empty').hidden,false);assert.equal(f.posts.length,0)}finally{f.close()}
});
test('saving one article preserves other draft values and their original revision',async()=>{
 const f=await fixture();try{f.edit(a,'countedUnits','9');for(const[k,v]of Object.entries({countedUnits:'7',minimumUnits:'2',targetUnits:'8'}))f.edit(b,k,v);f.save(b);await tick();assert.equal(f.posts.length,1);assert.equal(f.card(a).querySelector('[name=countedUnits]').value,'9');assert.match(f.by('draft-summary').textContent,/1 Artikel/);assert.equal(f.card(b).querySelector('[name=countedUnits]').value,'7');f.save(a);await tick();assert.equal(f.posts[1].expectedRevision,1);assert.equal(f.by('draft-summary').textContent,'');assert.equal(f.by('export').disabled,false);assert.equal(f.w.localStorage.getItem('bringness-shop-token'),'separate-shop')}finally{f.close()}
});
test('refresh detects conflicts without adopting a newer revision, including edits back to the old baseline',async()=>{
 const f=await fixture();try{f.edit(a,'countedUnits','9');f.edit(b,'countedUnits','7');Object.assign(f.rows[0],{revision:2,counted_units:6});f.by('refresh').click();await tick();assert.equal(f.card(a).querySelector('[name=countedUnits]').value,'9');assert.equal(f.card(a).querySelector('[type=submit]').disabled,true);f.edit(a,'countedUnits','5');f.save(a);assert.equal(f.posts.length,0);assert.match(f.card(a).textContent,/Serverstand/);f.confirm=false;f.card(a).querySelector('[type=button]').click();await tick();assert.equal(f.card(a).querySelector('[name=countedUnits]').value,'5');f.confirm=true;f.card(a).querySelector('[type=button]').click();await tick();assert.equal(f.card(a).querySelector('[name=countedUnits]').value,'6');assert.equal(f.card(b).querySelector('[name=countedUnits]').value,'7');assert.equal(f.posts.length,0)}finally{f.close()}
});
test('lost acknowledgments retain the exact command, while a known save survives a failed read refresh',async()=>{
 const f=await fixture();try{f.edit(a,'countedUnits','8');f.loseAck=true;f.save(a);await tick();assert.equal(f.by('retry').hidden,false);assert.equal(f.by('refresh').disabled,true);f.by('retry').click();await tick();assert.equal(f.posts.length,2);assert.deepEqual(f.posts[0],f.posts[1]);assert.equal(f.rows[0].revision,2);assert.equal(f.by('retry').hidden,true);f.edit(a,'countedUnits','10');f.failRead=true;f.save(a);await tick();assert.match(f.by('status').textContent,/Zählstand gespeichert/);assert.equal(f.card(a).querySelector('[name=countedUnits]').value,'10');assert.equal(f.by('retry').hidden,true);assert.equal(f.by('export').disabled,true);f.failRead=false;f.by('refresh').click();await tick();assert.equal(f.by('export').disabled,false)}finally{f.close()}
});
test('removed articles retain reviewable drafts until explicit discard and account changes close private state',async()=>{
 const f=await fixture();try{f.edit(a,'countedUnits','9');f.rows=f.rows.filter(row=>row.id!==a);f.by('refresh').click();await tick();const orphan=f.by('inventory').querySelector('[data-orphan=true]');assert.match(orphan.textContent,/Äpfel/);assert.match(orphan.textContent,/Gezählt 9/);assert.equal(f.by('inventory-csv').disabled,true);f.confirm=false;f.by('discard-all').click();assert(f.by('inventory').querySelector('[data-orphan=true]'));f.confirm=true;f.by('discard-all').click();assert.equal(f.by('inventory').querySelector('[data-orphan=true]'),null);assert.equal(f.posts.length,0);f.edit(b,'countedUnits','2');f.w.dispatchEvent(new f.w.StorageEvent('storage',{key:'bringness-pos-token'}));assert.equal(f.by('inventory').children.length,0);assert.equal(f.by('draft-summary').textContent,'');assert.equal(f.w.localStorage.getItem('bringness-shop-token'),'separate-shop')}finally{f.close()}
});
test('printing a filtered count worksheet is read-only and distinguishes unknown from zero',async()=>{
 const f=await fixture();try{f.by('inventory-filter').value='uncounted';f.by('inventory-filter').dispatchEvent(new f.w.Event('change'));f.by('count-sheet').click();assert.equal(f.printed,1);assert.equal(f.by('inventory-print').querySelectorAll('tbody tr').length,1);assert.match(f.by('inventory-print').textContent,/Nicht gezählt/);assert.equal(f.by('inventory-print').querySelector('tbody tr').lastElementChild.textContent,'');assert.equal(f.posts.length,0);f.by('print').click();assert.equal(f.by('inventory-print'),null);assert(f.by('test-print'));assert.equal(f.printed,2)}finally{f.close()}
});

test('leaving warning is limited to open input or an unconfirmed command',async()=>{const f=await fixture();try{assert.equal(f.w.dispatchEvent(new f.w.Event('beforeunload',{cancelable:true})),true);f.edit(a,'countedUnits','9');assert.equal(f.w.dispatchEvent(new f.w.Event('beforeunload',{cancelable:true})),false);f.confirm=true;f.by('discard-all').click();assert.equal(f.w.dispatchEvent(new f.w.Event('beforeunload',{cancelable:true})),true);assert.equal(f.posts.length,0)}finally{f.close()}});

test('prepared private worksheets are invalidated by edits, filters and account changes',async()=>{const f=await fixture();try{f.by('count-sheet').click();assert(f.by('inventory-print'));f.by('inventory-query').value='Äpfel';f.by('inventory-query').dispatchEvent(new f.w.Event('input'));assert.equal(f.by('inventory-print'),null);f.by('count-sheet').click();assert(f.by('inventory-print'));f.edit(a,'countedUnits','9');assert.equal(f.by('inventory-print'),null);f.confirm=true;f.by('discard-all').click();f.by('count-sheet').click();assert(f.by('inventory-print'));f.w.dispatchEvent(new f.w.StorageEvent('storage',{key:'bringness-pos-token'}));assert.equal(f.by('inventory-print'),null)}finally{f.close()}});

test('parent leave state reports only booleans and follows draft, uncertain write and recovery',async()=>{
 const f=await fixture();try{
  assert.deepEqual(JSON.parse(JSON.stringify(f.w.posOperationsLeaveState())),{dirty:false,pending:false,busy:false});
  f.edit(a,'countedUnits','8');assert.equal(f.w.posOperationsLeaveState().dirty,true);
  f.loseAck=true;f.save(a);await tick();assert.deepEqual(JSON.parse(JSON.stringify(f.w.posOperationsLeaveState())),{dirty:true,pending:true,busy:false});
  f.by('retry').click();await tick();assert.deepEqual(JSON.parse(JSON.stringify(f.w.posOperationsLeaveState())),{dirty:false,pending:false,busy:false});
  f.edit(b,'countedUnits','3');f.w.dispatchEvent(new f.w.StorageEvent('storage',{key:'bringness-pos-token'}));assert.equal(f.w.posOperationsLeaveState().dirty,false);
 }finally{f.close()}
});

test('actual POS restaurant change cancels before clearing the cart or removing inventory',async()=>{
 const source=await readFile(new URL('../../apps/web/public/pos/app.js',import.meta.url),'utf8');
 const handler=source.split('\n').find(line=>line.startsWith('$(')&&line.includes('"restaurant").onchange='));assert(handler);
 const dom=new JSDOM('<select id="restaurant" data-pos-selected-restaurant="first"><option value="first">First</option><option value="second">Second</option></select><nav id="mainnav"><button data-view="kasse"></button></nav><div id="posSettingsOperations"></div>',{runScripts:'outside-only'}),w=dom.window;
 try{
  w.document.body.dataset.posView='einstellungen';
  w.eval('const $=id=>document.getElementById(id);var cart=[{id:"kept"}],cat="all",allowed=false,renders=0,shown=[];function canLeavePosOperations(){return allowed}function render(){renders++;$("restaurant").dataset.posSelectedRestaurant=$("restaurant").value}function showModule(view){shown.push(view)};'+handler);
  const select=w.document.getElementById('restaurant');select.value='second';select.dispatchEvent(new w.Event('change'));assert.equal(select.value,'first');assert.equal(w.eval('cart[0].id'),'kept');assert(w.document.getElementById('posSettingsOperations'));assert.equal(w.eval('renders'),0);
  w.eval('allowed=true');select.value='second';select.dispatchEvent(new w.Event('change'));assert.equal(select.value,'second');assert.equal(w.eval('cart.length'),0);assert.equal(w.document.getElementById('posSettingsOperations'),null);assert.equal(w.eval('renders'),1);assert.equal(w.eval('shown.join(",")'),'einstellungen');
 }finally{w.close()}
});

test('lost confirmed save resolves after the product disappears without restoring it or writing twice',async()=>{
 const f=await fixture();try{
  f.loseAck=true;f.edit(a,'countedUnits','9');f.save(a);await tick();assert.equal(f.w.posOperationsLeaveState().pending,true);
  const request=structuredClone(f.posts[0]);f.rows=f.rows.filter(row=>row.id!==a);
  f.by('retry').click();await tick();assert.equal(f.posts.length,2);assert.deepEqual(f.posts[1],request);assert.equal(f.card(a),null);assert.equal(f.w.posOperationsLeaveState().pending,false);assert.equal(f.w.posOperationsLeaveState().dirty,false);assert.match(f.by('status').textContent,/Zählstand gespeichert/);
 }finally{f.close()}
});

const historyRow=(n,extra={})=>({event_number:String(n),request_id:'request-'+n,product_id:a,product_name:'=Historischer Artikel',revision:n,previous_revision:n-1,before_counted_units:n===1?null:1,before_minimum_units:n===1?null:2,before_target_units:n===1?null:3,counted_units:2,minimum_units:3,target_units:8,counted_at:date,actor_id:restaurant,actor_label:'=Betriebsverwaltung',...extra});
const historyReply=(rows,extra={})=>Response.json({restaurantId:restaurant,companyId:restaurant,recordingSince:date,asOf:'2',rows,nextCursor:null,...extra});
test('history paging and complete CSV preserve filters, snapshots and formula safety',async()=>{
 const f=await fixture({history:params=>historyReply(params.has('cursor')?[historyRow(1)]:[historyRow(2)],{nextCursor:params.has('cursor')?null:'2'})});try{
  f.by('history-query').value='Artikel';f.by('history-query').dispatchEvent(new f.w.Event('input'));f.by('history-load').click();await tick();assert.equal(f.by('history-list').children.length,1);assert.equal(f.by('history-more').hidden,false);assert.match(f.by('history-list').textContent,/Revision 2/);
  f.by('history-more').click();await tick();assert.equal(f.by('history-list').children.length,2);assert.equal(f.historyCalls[1].asOf,'2');assert.equal(f.historyCalls[1].cursor,'2');
  f.by('history-csv').click();await tick();assert.equal(f.downloads.length,1);const text=await new Promise(resolve=>{const reader=new f.w.FileReader();reader.onload=()=>resolve(reader.result);reader.readAsText(f.downloads[0]);});assert.match(text,/Now|Jetzt gezählt/);assert.match(text,/'=Historischer Artikel/);assert.match(text,/'=Betriebsverwaltung/);assert(f.historyCalls.every(call=>call.q==='Artikel'));assert.equal(f.posts.length,0);
  f.by('history-from').value='2026-11-01';f.by('history-from').dispatchEvent(new f.w.Event('input'));assert.equal(f.by('history-list').children.length,0);assert.equal(f.by('history-csv').disabled,true);
 }finally{f.close()}
});
test('article history keeps count drafts and clears private history on account change',async()=>{
 const f=await fixture({history:()=>historyReply([historyRow(1)])});try{
  f.edit(a,'countedUnits','99');[...f.card(a).querySelectorAll('button')].find(x=>x.textContent==='Zählverlauf ansehen').click();await tick();assert.equal(f.historyCalls[0].productId,a);assert.equal(f.card(a).querySelector('[name=countedUnits]').value,'99');assert.equal(f.by('history-csv').disabled,true);assert.equal(f.by('history-list').children.length,1);
  f.w.dispatchEvent(new f.w.StorageEvent('storage',{key:'bringness-pos-token'}));assert.equal(f.by('history-list').children.length,0);assert.equal(f.by('history-product').textContent,'');assert.equal(f.by('history-recording').textContent,'');assert.equal(f.w.localStorage.getItem('bringness-shop-token'),'separate-shop');
 }finally{f.close()}
});
test('saving invalidates a previously loaded history and revocation clears its private data',async()=>{
 let denied=false;const f=await fixture({history:()=>denied?Response.json({error:'Keine Freigabe'},{status:403}):historyReply([historyRow(1)])});try{
  f.by('history-load').click();await tick();assert.equal(f.by('history-list').children.length,1);f.edit(a,'countedUnits','7');f.save(a);await tick();assert.equal(f.by('history-list').children.length,0);assert.equal(f.by('history-csv').disabled,true);
  f.by('history-load').click();await tick();denied=true;f.by('history-load').click();await tick();assert.equal(f.by('history-list').children.length,0);assert.match(f.by('history-status').textContent,/Keine Freigabe/);assert.equal(f.posts.length,1);
 }finally{f.close()}
});
test('malformed history and repeated pagination never produce a partial export',async()=>{
 let bad=false;const f=await fixture({history:params=>bad?historyReply([historyRow(2),historyRow(2)]):historyReply([historyRow(2)],{nextCursor:'2'})});try{
  f.by('history-load').click();await tick();f.by('history-csv').click();await tick();assert.equal(f.downloads.length,0);assert.match(f.by('history-status').textContent,/doppelte|vollständig/);
  bad=true;f.by('history-load').click();await tick();assert.equal(f.by('history-list').children.length,0);assert.match(f.by('history-status').textContent,/nicht eindeutig/);
 }finally{f.close()}
});
test('history date filters include the last selected local day and late replies cannot restore cleared data',async()=>{
 let release;const f=await fixture({history:params=>new Promise(resolve=>{release=()=>resolve(historyReply([historyRow(1)]));})});try{
  f.by('history-from').value='2026-11-05';f.by('history-to').value='2026-11-06';f.by('history-load').click();await tick();assert.equal(f.historyCalls[0].from,new f.w.Date('2026-11-05T00:00:00').toISOString());assert.equal(f.historyCalls[0].to,new f.w.Date('2026-11-07T00:00:00').toISOString());
  f.w.dispatchEvent(new f.w.StorageEvent('storage',{key:'bringness-pos-token'}));release();await tick();assert.equal(f.by('history-list').children.length,0);assert.equal(f.by('history-recording').textContent,'');
 }finally{f.close()}
});
test('exports beyond 5000 history events fail without a partial file',async()=>{
 const f=await fixture({history:params=>{const end=Number(params.get('cursor')||'5102')-1;return historyReply(Array.from({length:100},(_,i)=>historyRow(end-i)),{asOf:'5101',nextCursor:String(end-99)});}});try{
  f.by('history-load').click();await tick();f.by('history-csv').click();for(let attempt=0;f.w.posOperationsLeaveState().busy&&attempt<100;attempt++)await tick();assert.equal(f.downloads.length,0);assert.match(f.by('history-status').textContent,/5000.*keine Teildatei/);
 }finally{f.close()}
});
test('a changed server company scope clears loaded history and aborts CSV',async()=>{
 let changed=false;const f=await fixture({history:()=>changed?Response.json({error:'Betriebskontext geändert',code:'HISTORY_SCOPE_CHANGED'},{status:409}):historyReply([historyRow(1)])});try{
  f.by('history-load').click();await tick();assert.equal(f.by('history-list').children.length,1);changed=true;f.by('history-csv').click();await tick();assert.equal(f.historyCalls.at(-1).companyId,restaurant);assert.equal(f.by('history-list').children.length,0);assert.equal(f.by('history-recording').textContent,'');assert.equal(f.downloads.length,0);assert.match(f.by('history-status').textContent,/Betriebskontext/);
 }finally{f.close()}
});
