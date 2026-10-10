import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from './ai-tests/node_modules/jsdom/lib/api.js';
const html=readFileSync(new URL('../apps/web/public/staff/activate.html',import.meta.url),'utf8');
for(const credentialType of ['pin','password'])test('activation form '+credentialType+' prepares and submits once with matching credentials',async()=>{
 const calls=[];const dom=new JSDOM(html,{url:'https://bringness.de/staff/activate.html#token='+'a'.repeat(64),runScripts:'dangerously',beforeParse(w){w.fetch=async(url,opts)=>{calls.push({url,body:JSON.parse(opts.body)});return {ok:true,json:async()=>url.endsWith('/details')?{credentialType,loginPath:credentialType==='pin'?'/service/':'/pos/'}:{message:'Dein Zugang ist eingerichtet.'}}}}});
 try{await new Promise(r=>setTimeout(r,0));const d=dom.window.document;assert.equal(calls.length,1);assert.equal(d.getElementById('submit').disabled,false);assert.equal(d.getElementById('stampLabel').hidden,credentialType==='pin');
 const password=credentialType==='pin'?'012345':'Secure1!';d.getElementById('newPassword').value=password;d.getElementById('repeatPassword').value=password;if(credentialType==='password')d.getElementById('stampPin').value='123456';
 d.getElementById('resetForm').dispatchEvent(new dom.window.Event('submit',{cancelable:true}));await new Promise(r=>setTimeout(r,0));assert.equal(calls.length,2);assert.equal(calls[1].url,'/api/v1/staff/activate');assert.equal(calls[1].body.password,password);assert.equal(d.getElementById('resetForm').hidden,true);assert.equal(dom.window.location.hash,'');
 }finally{dom.window.close()}
});
