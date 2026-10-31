import test from 'node:test';import assert from 'node:assert/strict';import {readFile,readdir} from 'node:fs/promises';import {pathToFileURL} from 'node:url';import {dependency} from './dependency.mjs';
const {JSDOM}=await import(pathToFileURL(dependency('jsdom','SHOP_JSDOM_PATH')));
test('shop legal links resolve to explicit drafts, including registration and checkout',async()=>{
 const root=new URL('../../apps/web/public/shop/',import.meta.url);
 for(const file of (await readdir(root)).filter(x=>x.endsWith('.html'))){const dom=new JSDOM(await readFile(new URL(file,root),'utf8'));try{const nav=dom.window.document.querySelector('footer .market-legal-links');assert.ok(nav,file);for(const a of nav.querySelectorAll('a')){assert.match(a.textContent,/Entwurf/);const path=new URL('../../apps/web/public'+a.getAttribute('href')+(a.getAttribute('href').endsWith('/')?'index.html':''),import.meta.url);await readFile(path);}}finally{dom.window.close();}}
 const legal=await readFile(new URL('legal.html',root),'utf8');for(const id of ['betreiber','datenschutz','kaeufer','widerruf','versand-zahlung','haendler'])assert.ok(legal.includes('id="'+id+'"'));assert.match(legal,/unvollständig/);assert.match(legal,/wirksamer Vertragsbeendigung/);
});
