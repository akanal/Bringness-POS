import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {JSDOM} from 'jsdom';
const script=await fs.readFile('apps/web/public/pos/trade.js','utf8');
const rid='11111111-1111-4111-8111-111111111111';
const dom=new JSDOM(`<select id="restaurant"><option value="${rid}">Test</option><option value="22222222-2222-4222-8222-222222222222">Other</option></select><button data-view="handel" hidden>Händler</button><div id="moduleBody"></div>`,{runScripts:'outside-only',url:'https://pos.test/pos/'}),w=dom.window;
w.eval('var $=id=>document.getElementById(id);');let enabled=false,unlocked=true,fail=false;const writes=[];
w.ensurePersonnelAccess=async()=>unlocked;
w.api=async(path,opt)=>{if(fail)throw Error('Verbindung fehlgeschlagen');if(opt){const b=JSON.parse(opt.body);writes.push(b);enabled=b.enabled;}return {enabled}};
w.eval(script);
try{
 await w.refreshTradeNavigation();assert(w.document.querySelector('[data-view="handel"]').hidden);
 await w.renderTradeModule();assert.match(w.document.getElementById('moduleBody').textContent,/ausgeschaltet/);
 await w.renderTradeSettings(rid);const checkbox=w.document.getElementById('tradeEnabled'),button=w.document.getElementById('tradeToggleSave');assert.equal(checkbox.checked,false);
 checkbox.checked=true;unlocked=false;await button.onclick();assert.equal(writes.length,0);unlocked=true;await button.onclick();assert.equal(writes.length,1);assert.equal(writes[0].restaurantId,rid);assert.equal(w.document.querySelector('[data-view="handel"]').hidden,false);
 checkbox.checked=false;await button.onclick();assert(w.document.querySelector('[data-view="handel"]').hidden);assert.match(w.document.getElementById('tradeToggleStatus').textContent,/ausgeschaltet/);
 fail=true;checkbox.checked=true;await button.onclick();assert.match(w.document.getElementById('tradeToggleStatus').textContent,/fehlgeschlagen/);assert(w.document.querySelector('[data-view="handel"]').hidden);
 fail=false;let resolve;w.api=()=>new Promise(r=>resolve=r);const pending=w.refreshTradeNavigation();w.document.getElementById('restaurant').value='22222222-2222-4222-8222-222222222222';resolve({enabled:true});await pending;assert(w.document.querySelector('[data-view="handel"]').hidden);
 console.log('Trade toggle UI passed: default hidden, protected enable/disable, denied unlock, failure visibility and stale restaurant response.');
}finally{w.close()}
