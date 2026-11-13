import assert from 'node:assert/strict';import fs from 'node:fs';import {JSDOM} from 'jsdom';
const source=fs.readFileSync(new URL('../../apps/web/public/pos/browser-support.js',import.meta.url),'utf8');
function setup(){const dom=new JSDOM('<section id="workspace" class="show"></section><select id="restaurant"><option value="r">r</option></select><input id="normal"><input id="secret" type="password"><button id="target">Ziel</button>',{url:'https://pos.example/pos/',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;w.localStorage.setItem('bringness-pos-token','owner');w.AbortSignal=AbortSignal;let tick,config,session={id:'session',state:'requested',expires_at:new Date(Date.now()+60000).toISOString()},commands=[],frames=0,acks=[],stops=0,captureOther=false;const track={readyState:'live',getCaptureHandle(){return {handle:captureOther?'foreign':config.handle,origin:w.location.origin}},addEventListener(){},stop(){this.readyState='ended'}};
 w.MediaStreamTrack=function(){};w.MediaStreamTrack.prototype.getCaptureHandle=()=>{};
 Object.defineProperty(w.navigator,'mediaDevices',{value:{setCaptureHandleConfig(c){config=c},async getDisplayMedia(){track.readyState='live';return {getTracks:()=>[track],getVideoTracks:()=>[track]}}}});
 w.onlineRegisterIdentity=async()=>({id:'register',deviceKey:'a'.repeat(64)});w.setInterval=f=>{tick=f};w.HTMLMediaElement.prototype.play=async()=>{};Object.defineProperty(w.HTMLVideoElement.prototype,'videoWidth',{get:()=>100});Object.defineProperty(w.HTMLVideoElement.prototype,'videoHeight',{get:()=>100});w.HTMLCanvasElement.prototype.getContext=()=>({drawImage(){}});w.HTMLCanvasElement.prototype.toDataURL=()=> 'data:image/jpeg;base64,/9j/2Q==';
 w.fetch=async(url,o)=>{const path=String(url).replace('/api/v1/remote-support/device/',''),b=JSON.parse(o.body);let d={};if(path==='poll'){d={session,commands};commands=[]}else if(path.endsWith('/accept')){session={...session,state:b.allowed?'active':'declined'};}else if(path.endsWith('/frame')){frames++;d={frameSequence:frames}}else if(path.endsWith('/ack'))acks.push(b);else if(path.endsWith('/stop')){stops++;session=null}return {ok:true,json:async()=>d}};
 w.eval(source);return {w,dom,run:()=>tick(),get frames(){return frames},get acks(){return acks},get stops(){return stops},command(input){commands=[{id:'cmd',input}]},other(){captureOther=true},noSession(){session=null},track};
}
const wait=async f=>{for(let i=0;i<100;i++){if(f())return;await new Promise(r=>setTimeout(r,5))}throw Error('UI timeout')};
{
 const h=setup();await h.run();assert(h.w.document.body.textContent.includes('Bringness fragt Bildschirmhilfe'));
 h.w.document.querySelectorAll('#browserSupportNotice button')[1].click();await wait(()=>h.w.document.body.textContent.includes('Fernhilfe aktiv'));await h.run();assert.equal(h.frames,1);
 const el=h.w.document.querySelector('#normal');el.focus();h.command({type:'text',text:'Speisekarte',frameSequence:1});await h.run();assert.equal(el.value,'Speisekarte');assert.equal(h.acks.at(-1).state,'completed');
 const secret=h.w.document.querySelector('#secret');secret.focus();h.command({type:'text',text:'verboten',frameSequence:2});await h.run();assert.equal(secret.value,'');assert.equal(h.acks.at(-1).state,'failed');
 el.focus();h.command({type:'text',text:'alt',frameSequence:1});await h.run();assert.equal(el.value,'Speisekarte');assert.equal(h.acks.at(-1).state,'failed');
 const select=h.w.document.createElement('select');select.innerHTML='<option>A</option><option>B</option>';h.w.document.body.append(select);select.focus();h.command({type:'key',key:'ArrowDown',frameSequence:h.frames});await h.run();assert.equal(select.value,'B');assert.equal(h.acks.at(-1).state,'completed');
 el.focus();el.setSelectionRange(el.value.length,el.value.length);h.command({type:'key',key:'Backspace',frameSequence:h.frames});await h.run();assert.equal(el.value,'Speisekart');
 let permissionClicked=false;const local=h.w.document.createElement('aside');local.id='registerMaintenanceNotice';local.innerHTML='<button>Nur lokal bestätigen</button>';h.w.document.body.append(local);local.querySelector('button').onclick=()=>permissionClicked=true;h.w.document.elementFromPoint=()=>local.querySelector('button');h.command({type:'click',x:1,y:1,frameSequence:h.frames});await h.run();assert.equal(permissionClicked,false);assert.equal(h.acks.at(-1).state,'failed');
h.w.document.querySelector('#browserSupportNotice button').click();await wait(()=>h.stops===1);assert.equal(h.track.readyState,'ended');h.dom.window.close();
}
{
 const h=setup();await h.run();h.other();h.w.document.querySelector('#browserSupportNotice button').click();await wait(()=>h.track.readyState==='ended');assert.equal(h.stops,0);assert.equal(h.frames,0);assert(h.w.document.body.textContent.includes('ausschließlich diesen'));h.dom.window.close();
}
{
 const h=setup();await h.run();h.w.document.querySelector('#browserSupportNotice button').click();await wait(()=>h.w.document.body.textContent.includes('Fernhilfe aktiv'));await h.run();h.w.document.querySelector('#normal').focus();h.command({type:'text',text:'nicht erlaubt',frameSequence:1});await h.run();assert.equal(h.w.document.querySelector('#normal').value,'');assert.equal(h.acks.at(-1).state,'failed');h.noSession();await h.run();assert.equal(h.track.readyState,'ended');assert.equal(h.w.document.querySelector('#browserSupportNotice'),null);h.dom.window.close();
}
{
 const d=new JSDOM('<div></div>',{url:'https://pos.example/pos/',runScripts:'outside-only',pretendToBeVisual:true});d.window.eval(source);assert.equal(d.window.document.querySelector('#browserSupportNotice'),null);d.window.close();
}
console.log('Browser support passed: mandatory local consent, verified self tab, foreign tab rejected, view-only respected, bounded frame/input matching, password field blocked, stop/revocation cleanup and unsupported browser closed.');
