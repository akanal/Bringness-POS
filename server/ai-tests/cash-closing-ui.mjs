import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import {JSDOM} from 'jsdom';
const script=await fs.readFile(new URL('../../apps/web/public/pos/cash-closing.js',import.meta.url),'utf8');
const rid=crypto.randomUUID(),key='bringness.cash.pending.v1:'+rid;let requests=[],lost=true;
function fixture(stored){const dom=new JSDOM('<select id="restaurant"><option value="'+rid+'">Shop</option></select><div id="moduleBody"></div>',{runScripts:'outside-only',url:'https://test.example/pos/'});const w=dom.window;Object.defineProperty(w,'crypto',{value:crypto.webcrypto});w.confirm=()=>true;w.api=async(path,opt)=>{if(!opt)return {sessions:[]};requests.push(JSON.parse(opt.body));if(lost)throw Error('Verbindung verloren');return {session:{}};};if(stored)w.localStorage.setItem(key,stored);w.eval(script);return w;}
const w=fixture();try{await w.renderCashClosing();w.document.querySelector('[data-amount]').value='10,25';await w.document.querySelector('[data-actions] button').onclick();assert.equal(requests[0].amountCents,1025);assert(w.localStorage.getItem(key));assert(w.document.querySelector('[data-actions] button').disabled);const stored=w.localStorage.getItem(key);const resumed=fixture(stored);try{lost=false;await resumed.renderCashClosing();await resumed.document.querySelector('[data-retry]').onclick();assert.deepEqual(requests[1],requests[0]);assert.equal(resumed.localStorage.getItem(key),null);}finally{resumed.close();}}finally{w.close();}
console.log('Cash UI: euro cents, persisted uncertain request, reload/retry with identical key passed.');
