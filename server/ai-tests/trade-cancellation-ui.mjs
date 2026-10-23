import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import {JSDOM} from 'jsdom';
const id=crypto.randomUUID(),key='bringness.trade.cancellation-draft.v1:'+id;
const source=await fs.readFile('apps/web/public/pos/trade-cancellation.js','utf8');
const review={original:{id,number:'HR-2026-000001'},proposedReversalCents:-119,issues:[]};
const fixture=async(api,stored,unlock=true,r=review)=>{
 const dom=new JSDOM('<main></main>',{url:'https://fixture.test/',runScripts:'outside-only'}),w=dom.window;
 Object.defineProperty(w,'crypto',{value:crypto.webcrypto});w.api=api;w.ensurePersonnelAccess=async()=>unlock;
 if(stored)w.localStorage.setItem(key,stored);w.eval(source);
 await w.bnMountCancellationDraft(w.document.querySelector('main'),id,r);return w;
};
const save=w=>w.document.querySelector('form').onsubmit({preventDefault(){}});
const draft=body=>({status:'draft_only',canCancel:false,id:crypto.randomUUID(),receiptId:id,requestKey:body.requestKey,reason:body.reason,createdAt:new Date().toISOString(),review});
let writes=[];
const denied=await fixture(async(path,opt)=>{if(opt?.method==='POST')writes.push(opt);return {draft:null}},null,false);
try{denied.document.querySelector('textarea').value='Test Grund';await save(denied);assert.equal(writes.length,0);assert.equal(denied.localStorage.getItem(key),null);assert.match(denied.document.body.textContent,/Verwaltungsfreigabe/);}finally{denied.close()}
const api=async(path,opt)=>{assert(path.endsWith('/cancellation-draft'));if(!opt)return {draft:null};const body=JSON.parse(opt.body);writes.push(body);throw Error('Antwort unterbrochen');};
const initial=await fixture(api);let stored;
try{
 initial.document.querySelector('textarea').value='Falscher Empfänger';await save(initial);assert.equal(writes.length,1);stored=initial.localStorage.getItem(key);assert(stored);assert(initial.document.querySelector('textarea').readOnly);assert.match(initial.document.querySelector('[role=status]').textContent,/unterbrochen/);
}finally{initial.close()}
const resumed=await fixture(async(path,opt)=>{if(!opt)return {draft:null};const body=JSON.parse(opt.body);writes.push(body);return {draft:draft(body)};},stored);
try{
 assert(resumed.document.querySelector('textarea').readOnly);await save(resumed);assert.deepEqual(writes[0],writes[1]);assert.equal(resumed.localStorage.getItem(key),null);assert.match(resumed.document.body.textContent,/Stornoentwurf gespeichert/);assert.match(resumed.document.body.textContent,/kein ausgestellter Stornobeleg/);assert.equal(resumed.document.querySelector('form'),null);
}finally{resumed.close()}
const originalDraft=draft({...JSON.parse(stored),reason:'Grund <img src=x>'});
const reopened=await fixture(async()=>({draft:originalDraft}),stored);
try{assert.equal(reopened.document.querySelector('img'),null);assert.match(reopened.document.body.textContent,/Grund <img/);assert.equal(reopened.document.querySelector('form'),null);assert.equal(reopened.localStorage.getItem(key),null);}finally{reopened.close()}
for(const corrupt of ['{',JSON.stringify({requestKey:'bad',reason:'Test Grund'})]){
 const w=await fixture(async()=>({draft:null}),corrupt);
 try{assert.equal(w.document.querySelector('form'),null);assert.match(w.document.body.textContent,/beschädigt/);assert.equal(w.localStorage.getItem(key),corrupt);}finally{w.close()}
}
const blocked=await fixture(async()=>({draft:null}),null,true,{...review,issues:[{code:'deposit_returned'}]});
try{assert.equal(blocked.document.querySelector('form'),null);assert.match(blocked.document.body.textContent,/Klärung/);}finally{blocked.close()}
const mismatch=await fixture(async(path,opt)=>!opt?{draft:null}:{draft:{...draft(JSON.parse(opt.body)),receiptId:crypto.randomUUID()}});
try{mismatch.document.querySelector('textarea').value='Test Grund';await save(mismatch);assert(mismatch.localStorage.getItem(key));assert.match(mismatch.document.body.textContent,/nicht eindeutig/);}finally{mismatch.close()}
let release;
const late=await fixture(async(path,opt)=>!opt?{draft:null}:await new Promise(resolve=>release=()=>resolve({draft:draft(JSON.parse(opt.body))})));
try{late.document.querySelector('textarea').value='Test Grund';const sending=save(late);await new Promise(r=>setImmediate(r));assert(late.document.querySelector('[data-cancellation-save]').disabled);late.document.querySelector('main').remove();release();await sending;assert.equal(late.localStorage.getItem(key),null);assert.equal(late.document.querySelector('section'),null);}finally{late.close()}
console.log('Cancellation draft UI passed: PIN denial, durable lost-response replay after reload, saved reopening, escaped reason, corrupt-store refusal, blocked review, wrong receipt response and closed-view response.');
