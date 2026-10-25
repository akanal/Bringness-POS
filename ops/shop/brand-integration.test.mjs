import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {dependency} from './dependency.mjs';
import {brandInjectionAnchor,protectShopBrandInjection,gitBlob} from './integration-start.mjs';
const inject=source=>new Function('normalized','html',source+'return html;');
const before=inject(brandInjectionAnchor),after=inject(protectShopBrandInjection(brandInjectionAnchor));
const html='<html><head><title>Shop</title></head><body><header><a class="brand" href="/shop/"><span class="brand-wordmark">Bringness</span><span class="brand-shop">shop</span></a></header></body></html>';
test('existing generic injection would affect shop while the guarded candidate preserves exact bytes',()=>{const path='/opt/bringness/app/apps/web/public/shop/index.html';assert.match(before(path,html),/src="\/brand-logo.js"/);assert.equal(after(path,html),html);});
test('every actual shop HTML page is preserved by the candidate guard',async()=>{for(const name of ['index','account','register','licences','help','payment-return','order-history','download-history','download-review']){let value;try{value=await readFile(new URL('../../apps/web/public/shop/'+name+'.html',import.meta.url),'utf8');}catch(e){throw e;}assert.equal(after('/opt/bringness/app/apps/web/public/shop/'+name+'.html',value),value,name);}});
test('POS waiter table admin and ordinary site keep their exact prior injection',()=>{for(const page of ['pos/index.html','service/index.html','tisch/index.html','admin/index.html','index.html','accountant.html','shop-other/index.html']){const path='/opt/bringness/app/apps/web/public/'+page;assert.equal(after(path,html),before(path,html),page);assert.match(after(path,html),/brand-logo.js/);}});
test('existing AI exclusion and already injected helper behaviour remain unchanged',()=>{for(const page of ['ai/index.html','aidocs.html']){const path='/opt/bringness/app/apps/web/public/'+page;assert.equal(after(path,html),before(path,html));}const injected=html.replace('</head>','<script src="/brand-logo.js"></script></head>');assert.equal(after('/opt/apps/web/public/pos/index.html',injected),injected);});
test('guard requires a unique exact source anchor and rejects double application',()=>{for(const source of ['',brandInjectionAnchor+brandInjectionAnchor,brandInjectionAnchor.replace("'/ai'","'/changed'")])assert.throws(()=>protectShopBrandInjection(source),/SHOP_BRAND_ANCHOR_CHANGED/);assert.throws(()=>protectShopBrandInjection(protectShopBrandInjection(brandInjectionAnchor)),/SHOP_BRAND_GUARD_ALREADY_PRESENT/);});
test('the only changed bytes in the injection statement are the shop path exclusion',()=>{const protectedSource=protectShopBrandInjection(brandInjectionAnchor);assert.equal(protectedSource.replace(" && !normalized.includes('/apps/web/public/shop/')",''),brandInjectionAnchor);});
test('guard does not inject helpers into shop pages with query-like names or subfolders',()=>{for(const path of ['/opt/apps/web/public/shop/nested/index.html','C:/bringness/apps/web/public/shop/account.html'])assert.equal(after(path,html),html);});
test('unrelated sibling directory names do not suppress their previous branding',()=>{for(const path of ['/opt/apps/web/public/shopping/index.html','/opt/apps/web/public/shop-preview/index.html'])assert.equal(after(path,html),before(path,html));});
test('unchanged wordmark retains its accessible text and destination',()=>{const require=createRequire(import.meta.url),{JSDOM}=require(dependency('jsdom','SHOP_JSDOM_PATH')),dom=new JSDOM(after('/opt/apps/web/public/shop/index.html',html));try{const a=dom.window.document.querySelector('a.brand');assert.equal(a.textContent,'Bringnessshop');assert.equal(a.getAttribute('href'),'/shop/');assert.equal(a.querySelector('img'),null);}finally{dom.window.close();}});

test('verified generic logo helper reproduces the unwanted wordmark replacement without network access',async()=>{
 const source=await readFile(new URL('../../apps/web/public/brand-logo.js',import.meta.url),'utf8');assert.equal(gitBlob(source),'f99d2f12adcd199f3f97b0c587340fbd39900663');
 const require=createRequire(import.meta.url),{JSDOM}=require(dependency('jsdom','SHOP_JSDOM_PATH')),dom=new JSDOM(html,{url:'https://fixture.test/shop/',runScripts:'outside-only'}),w=dom.window;
 try{w.fetch=()=>assert.fail('unexpected network');w.MutationObserver=class{observe(){}};w.eval(source);w.document.dispatchEvent(new w.Event('DOMContentLoaded'));assert.equal(w.document.querySelector('.brand-wordmark'),null);assert.equal(w.document.querySelector('a.brand img').getAttribute('src'),'/assets/bringness-logo.png');assert.equal(after('/opt/apps/web/public/shop/index.html',html),html);}finally{w.close();}
});
