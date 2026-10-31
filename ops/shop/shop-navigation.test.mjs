import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {dependency} from './dependency.mjs';
const require=createRequire(import.meta.url),{JSDOM}=require(dependency('jsdom','SHOP_JSDOM_PATH'));
const root=new URL('../../apps/web/public/shop/',import.meta.url);
test('every shop header separates home navigation from accessible contextual assistant, without floating entries',async()=>{
 for(const file of (await readdir(root)).filter(f=>f.endsWith('.html'))){
  const dom=new JSDOM(await readFile(new URL(file,root),'utf8'));
  try{
   const d=dom.window.document;
   assert.equal(d.querySelectorAll('.assistant-entry').length,0,file);
   const arrow=d.querySelector('header a[aria-label="Bringness-Assistent öffnen"]');
   assert.ok(arrow,file+' assistant navigation');
   assert.ok(arrow.querySelector('svg.brand-arrow'),file+' arrow click target');
   assert.match(arrow.getAttribute('href'),/^\/shop\/assistant\.html#(account|buy|offer)$/);
   assert.ok(d.querySelector('header a[href="/shop/"]'),file+' home remains available');
   assert.equal(arrow.querySelector('a'),null,file+' no nested links');
  }finally{dom.window.close();}
 }
});
test('shop account navigation stays in shop and explains shared login and separate merchant approval',async()=>{
 const dom=new JSDOM(await readFile(new URL('account.html',root),'utf8'));
 try{
  const d=dom.window.document;
  assert.equal(d.querySelector('a[href="/pos/"]'),null);
  assert.ok(d.querySelector('.account-secondary-actions a[href="/shop/my-shop.html"]'));
  assert.match(d.querySelector('main').textContent,/Ein Bringness-Konto/);
  assert.match(d.querySelector('main').textContent,/Händlerzugang benötigt zusätzlich eine Freigabe/);
 }finally{dom.window.close();}
});
