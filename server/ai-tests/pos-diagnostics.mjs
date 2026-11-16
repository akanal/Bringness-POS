import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
const read=p=>readFileSync(new URL('../../'+p,import.meta.url),'utf8');
const html=read('apps/web/public/pos/index.html'),diagnostics=read('apps/web/public/pos/diagnostics.js'),auth=read('apps/web/public/pos/auth.js'),app=read('apps/web/public/pos/app.js');
const tick=()=>new Promise(r=>setImmediate(r));
function fixture(){const w=new JSDOM(html,{url:'https://pos.test/pos/?token=never-export',runScripts:'outside-only'}).window;w.console.error=()=>{};w.eval(diagnostics);return {w,el:id=>w.document.getElementById(id)};}
{
 const {w,el}=fixture();try{
  w.eval(auth);w.bnPosAuth.connect(async()=>{});el('email').value='private@example.test';el('password').value='private-password';
  w.fetch=async()=>({ok:false,status:401,json:async()=>({error:'E-Mail oder Passwort stimmen nicht.'})});el('authForm').dispatchEvent(new w.Event('submit',{cancelable:true}));await tick();
  assert.match(el('authMsg').textContent,/POS-LOGIN-AUTH/);assert(!el('authSubmit').disabled);
  let copied;Object.defineProperty(w.navigator,'clipboard',{value:{writeText:async text=>{copied=text;}}});el('posDiagnostic').querySelector('button').click();await tick();
  const record=JSON.parse(copied);assert.deepEqual(Object.keys(record).sort(),['code','online','time','version']);assert.equal(record.code,'POS-LOGIN-AUTH');assert(!/private|never-export|password|example|token=/.test(copied));
  w.fetch=async()=>({ok:false,status:429,json:async()=>({error:'Bitte warten.'})});el('forgotPassword').click();await tick();assert.match(el('authMsg').textContent,/POS-RESET-LIMIT/);
  w.fetch=async()=>({ok:true,status:200,json:async()=>({})});el('forgotPassword').click();await tick();assert.match(el('authMsg').textContent,/POS-RESET-RESPONSE/);
  w.fetch=async()=>{throw new w.TypeError('secret raw error');};el('authForm').dispatchEvent(new w.Event('submit',{cancelable:true}));await tick();assert.match(el('authMsg').textContent,/POS-LOGIN-NETWORK/);assert(!el('authMsg').textContent.includes('secret'));
  w.navigator.clipboard.writeText=async()=>{throw Error('denied');};el('posDiagnostic').querySelector('button').click();await tick();const text=el('posDiagnostic').querySelector('textarea');assert(!text.hidden);assert(text.readOnly);assert.equal(JSON.parse(text.value).code,'POS-LOGIN-NETWORK');
  w.bnPosDiagnostics.report('CONNECTION','NETWORK');assert.match(el('posDiagnostic').textContent,/POS-LOGIN-NETWORK/);
  el('restaurant').dispatchEvent(new w.Event('change'));assert.equal(el('posDiagnostic'),null);
 }finally{w.close();}
}
{
 const {w,el}=fixture();try{
  w.eval(auth);w.bnPosAuth.connect(async()=>{});el('email').value='private@example.test';let expire;
  w.setTimeout=(fn,ms)=>{assert.equal(ms,60000);expire=fn;return 1;};w.clearTimeout=()=>{};w.fetch=()=>new Promise(()=>{});
  el('forgotPassword').click();await tick();expire();await tick();assert.match(el('authMsg').textContent,/POS-RESET-TIMEOUT/);assert(!el('forgotPassword').disabled);
 }finally{w.close();}
}
{
 const {w,el}=fixture();try{
  w.eval(app);let count=0;w.fetch=async()=>{count++;throw new w.TypeError('private body');};
  await assert.rejects(w.api('/products/private-id',{method:'PUT',body:'secret-customer'}),e=>/POS-SAVE-NETWORK/.test(e.message)&&/Speicherstatus ist unklar/.test(e.message));assert.equal(count,1);
  w.fetch=async()=>({ok:false,status:403,json:async()=>({error:'Keine Freigabe',code:'business-rule',retryAfter:42})});
  await assert.rejects(w.api('/products/private-id'),e=>e.status===403&&e.code==='business-rule'&&e.retryAfter===42&&e.diagnosticCode==='POS-LOAD-ACCESS');
  w.fetch=async()=>({ok:true,status:200,json:async()=>null});await assert.rejects(w.api('/bootstrap'),/POS-LOAD-RESPONSE/);
  w.bnPosDiagnostics.clear();w.fetch=async()=>({ok:true,status:200,json:async()=>({status:'bad',database:'bad'})});await w.checkConnection();assert.match(el('posDiagnostic').textContent,/POS-CONNECTION-SERVER/);
  const error=new w.Error('Original');error.commandId='private-order';error.pending=true;const decorated=w.bnPosDiagnostics.decorate(error,'SAVE');assert.equal(decorated,error);assert.equal(decorated.commandId,'private-order');assert(decorated.pending);assert.equal(w.bnPosDiagnostics.decorate(error,'LOAD'),error);assert.equal(error.message.match(/POS-/g).length,1);
  w.bnPosDiagnostics.report('private-path','secret-token');assert.match(el('posDiagnostic').textContent,/POS-LOAD-FAILED/);assert(!el('posDiagnostic').textContent.includes('secret'));
  w.dispatchEvent(new w.StorageEvent('storage',{key:'bringness-pos-token'}));assert.equal(el('posDiagnostic'),null);
  // Late Clipboard failure must not redisplay cleared diagnostics.
  let reject;Object.defineProperty(w.navigator,'clipboard',{value:{writeText:()=>new Promise((_,r)=>reject=r)}});w.bnPosDiagnostics.report('LOAD','SERVER');el('posDiagnostic').querySelector('button').click();w.bnPosDiagnostics.clear();reject(Error());await tick();assert.equal(el('posDiagnostic'),null);
 }finally{w.close();}
}
{
 const {w,el}=fixture();try{
  for(const scope of ['DISPLAY','PERSONNEL','CATALOG','TAX','AVAILABILITY']){
   let calls=0;w.fetch=async()=>{calls++;throw new w.TypeError('private-customer-token');};
   await assert.rejects(w.bnPosDiagnostics.jsonRequest(scope,'/private-customer',{method:'POST',body:'private-secret'}),e=>e.diagnosticCode==='POS-'+scope+'-NETWORK'&&/Speicherstatus ist unklar/.test(e.message)&&!e.message.includes('private'));
   assert.equal(calls,1);
   w.fetch=async()=>({ok:false,status:403,json:async()=>({error:'Keine Freigabe',code:'locked',retryAfter:12})});
   await assert.rejects(w.bnPosDiagnostics.jsonRequest(scope,'/private-customer'),e=>e.status===403&&e.code==='locked'&&e.retryAfter===12&&e.diagnosticCode==='POS-'+scope+'-ACCESS');
   w.fetch=async()=>({ok:false,status:401,json:async()=>{throw Error('html');}});
   await assert.rejects(w.bnPosDiagnostics.jsonRequest(scope,'/private-customer'),e=>e.diagnosticCode==='POS-'+scope+'-AUTH');
   w.fetch=async()=>({ok:true,status:200,json:async()=>null});
   await assert.rejects(w.bnPosDiagnostics.jsonRequest(scope,'/private-customer',{method:'PUT'}),e=>e.diagnosticCode==='POS-'+scope+'-RESPONSE'&&/Speicherstatus ist unklar/.test(e.message));
   w.fetch=async()=>({ok:true,status:200,json:async()=>({saved:true})});
   assert.equal((await w.bnPosDiagnostics.jsonRequest(scope,'/private-customer',{method:'POST'})).saved,true);
  }
  w.bnPosDiagnostics.clear();let reject;w.fetch=()=>new Promise((_,r)=>reject=r);
  const pending=w.bnPosDiagnostics.jsonRequest('PERSONNEL','/private');w.localStorage.setItem('bringness-pos-token','new-session');reject(new w.TypeError('private'));
  await assert.rejects(pending);assert.equal(el('posDiagnostic'),null,'old session cannot report into new session');
  let sent;w.fetch=async(url,options)=>{sent=options;return {ok:true,json:async()=>({ok:true})}};
  const headers={'x-personnel-unlock':'private-unlock'},body='private-body';await w.bnPosDiagnostics.jsonRequest('PERSONNEL','/private',{method:'POST',headers,body});assert.equal(sent.headers,headers);assert.equal(sent.body,body);
 }finally{w.close();}
}
assert(html.indexOf('/pos/diagnostics.js?')<html.indexOf('/pos/auth.js?'));
console.log('POS diagnostics passed: auth/reset/network/deadline, API status preservation, unknown write status, no retries, fixed privacy fields, clipboard fallback, stale-copy and scope clearing.');

{
 const {w,el}=fixture();try{
  w.eval(app);
  for(const [path,scope] of [['/trade/prices','TRADE'],['/pos-inventory','STOCK']]){
   let calls=0;w.fetch=async()=>{calls++;throw new w.TypeError('secret-body');};
   await assert.rejects(w.api(path,{method:'POST',body:'private'}),error=>error.diagnosticCode==='POS-'+scope+'-NETWORK'&&/Speicherstatus ist unklar/.test(error.message));assert.equal(calls,1);
  }
  w.setTimeout=(fn,ms)=>{if(ms<=1000){queueMicrotask(fn);return 0;}return 1;};w.clearTimeout=()=>{};let calls=0;
  w.fetch=async()=>{if(calls++===0)return {ok:true,status:202,json:async()=>({commandId:'private-command',pending:true})};throw new w.TypeError('lost poll');};
  await assert.rejects(w.api('/stock-commands/private',{method:'POST',body:'private'}),error=>error.pending===true&&error.commandId==='private-command'&&error.diagnosticCode==='POS-STOCK-NETWORK');assert.equal(calls,2);
  w.fetch=async()=>({ok:false,status:403,json:async()=>({error:'Kein Zugriff',code:'LOCKED',retryAfter:3})});
  await assert.rejects(w.bnPosDiagnostics.pdfRequest('TRADE','/private',{headers:{authorization:'private'}}),error=>error.status===403&&error.code==='LOCKED'&&error.retryAfter===3&&error.diagnosticCode==='POS-TRADE-ACCESS');
  for(const blob of [new w.Blob([],{type:'application/pdf'}),new w.Blob(['private html'],{type:'text/html'})]){w.fetch=async()=>({ok:true,blob:async()=>blob});await assert.rejects(w.bnPosDiagnostics.pdfRequest('TRADE','/private'),error=>error.diagnosticCode==='POS-TRADE-RESPONSE');}
  const blob=new w.Blob(['%PDF-fixture'],{type:'application/pdf'}),headers={authorization:'private'};let sent;
  w.fetch=async(url,options)=>{sent=options;return {ok:true,blob:async()=>blob};};assert.equal(await w.bnPosDiagnostics.pdfRequest('TRADE','/private',{headers}),blob);assert.equal(sent.headers,headers);
  w.bnPosDiagnostics.clear();let reject;w.fetch=()=>new Promise((_,r)=>reject=r);const pending=w.bnPosDiagnostics.pdfRequest('TRADE','/private');w.localStorage.setItem('bringness-pos-token','new');reject(new w.TypeError('private'));await assert.rejects(pending);assert.equal(el('posDiagnostic'),null);
 }finally{w.close();}
}
console.log('Stock/trade diagnostics passed: uncertain count replay, stock polling metadata, scoped actions, PDF validation/status and stale-session privacy.');
