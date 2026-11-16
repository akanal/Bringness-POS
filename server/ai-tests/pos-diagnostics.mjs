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
assert(html.indexOf('/pos/diagnostics.js?')<html.indexOf('/pos/auth.js?'));
console.log('POS diagnostics passed: auth/reset/network/deadline, API status preservation, unknown write status, no retries, fixed privacy fields, clipboard fallback, stale-copy and scope clearing.');
