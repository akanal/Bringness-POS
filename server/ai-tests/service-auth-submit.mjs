import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
const html=fs.readFileSync(new URL('../../apps/web/public/service/index.html',import.meta.url),'utf8');
const script=fs.readFileSync(new URL('../../apps/web/public/service/app.js',import.meta.url),'utf8');
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
for(const kind of ['password','pin']){
 const raw='a'.repeat(64),dom=new JSDOM(html,{url:'https://example.test/service/#reset='+raw,runScripts:'outside-only'}),w=dom.window;
 try{
  let release,entered,submitted;
  const gate=new Promise(resolve=>{release=resolve;}),started=new Promise(resolve=>{entered=resolve;});
  w.fetch=async(url,options)=>{
   assert.equal(url,'/api/v1/staff/reset');const body=JSON.parse(options.body);assert.equal(body.token,raw);
   if(body.inspect)return {ok:true,json:async()=>({kind})};
   submitted=body;entered();await gate;return {ok:true,json:async()=>({message:'Gespeichert. Du kannst dich jetzt anmelden.'})};
  };
  w.eval(script);await tick();
  const form=w.document.getElementById('resetForm'),value=kind==='pin'?'5678':'NewServicePass2!';
  w.document.getElementById('resetValue').value=value;w.document.getElementById('resetConfirm').value=value;
  const event=new w.Event('submit',{bubbles:true,cancelable:true});form.dispatchEvent(event);await started;
  assert.equal(event.currentTarget,null);assert.equal(form.querySelector('button').disabled,true);
  release();await tick();await tick();
  assert.equal(form.hidden,true,w.document.getElementById('resetMsg').textContent);
  assert.match(w.document.getElementById('resetMsg').textContent,/Gespeichert/);
  assert.equal(w.document.getElementById('resetValue').value,'');assert.equal(w.document.getElementById('resetConfirm').value,'');
  assert.deepEqual(submitted,{token:raw,value,confirm:value});
 }finally{w.close();}
}
console.log('Service reset submit passed: real DOM event dispatch, cleared event.currentTarget after await, delayed password/PIN success, hidden form and cleared secret inputs.');
