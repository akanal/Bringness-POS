import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {PGlite} from '@electric-sql/pglite';
import {createOfflineLedger} from '../../apps/desktop/offline-ledger.mjs';
import {quoteOfflineSale} from '../offline-sale-core.js';

const db=new PGlite();
try{
 const ledger=await createOfflineLedger(db,quoteOfflineSale),uuid=()=>crypto.randomUUID();
 const restaurant=uuid(),product=uuid(),issuedAt=Date.now();
 const snapshot={id:uuid(),companyId:uuid(),deviceKey:'a'.repeat(64),createdAt:new Date(issuedAt).toISOString(),validUntil:new Date(issuedAt+86400000).toISOString(),restaurants:[{id:restaurant,name:'Test'}],products:[{id:product,restaurantId:restaurant,name:'Coffee',priceCents:250,taxRate:19}],merchant:{[restaurant]:{businessName:'Test'}}};
 await ledger.catalog(snapshot);
 const html=await fs.readFile(new URL('../../apps/desktop/offline.html',import.meta.url),'utf8');
 const script=await fs.readFile(new URL('../../apps/desktop/offline-ui.js',import.meta.url),'utf8');
 const request=()=>({id:uuid(),snapshotId:snapshot.id,restaurantId:restaurant,createdAt:new Date().toISOString(),paymentMethod:'cash',items:[{productId:product,quantity:2}]});
 async function windowFor(pending){
  const dom=new JSDOM(html,{url:'https://offline.test/',runScripts:'outside-only'}),w=dom.window;
  Object.defineProperty(w,'crypto',{value:crypto.webcrypto});
  if(pending)w.localStorage.setItem('bringness.offline.pending-sale.v1',JSON.stringify(pending));
  w.offlinePOS={view:selection=>ledger.view(selection),sale:r=>ledger.sale(r),updated(callback){w.triggerOfflineUpdate=callback},sync:async()=>{},online:async()=>{}};
  w.eval(script);return w;
 }
 const wait=async predicate=>{for(let n=0;n<100;n++){if(await predicate())return;await new Promise(resolve=>setTimeout(resolve,10));}throw Error('offline recovery timeout');};
 for(const saved of [false,true]){
  const pending=request(),before=await ledger.pendingCount();
  if(saved)await ledger.sale(pending);
  const w=await windowFor(pending);
  try{
   await wait(()=>!w.document.getElementById('pay').disabled&&w.document.getElementById('items').children.length===1);
   assert.match(w.document.getElementById('total').textContent,/5,00/);
   await w.document.getElementById('pay').onclick();
   assert.equal(await ledger.pendingCount(),before+1);
   assert.equal((await ledger.pending()).filter(s=>s.id===pending.id).length,1);
   assert.equal(w.localStorage.getItem('bringness.offline.pending-sale.v1'),null);
   assert.equal(w.document.getElementById('receipt').textContent.includes(pending.id),true);
  }finally{w.close();}
 }
 const before=await ledger.pendingCount(),bad={...request(),restaurantId:'invalid-restaurant'};
 const w=await windowFor(bad);
 try{
  await wait(()=>w.document.getElementById('products').children.length===1);
  assert.equal(w.document.getElementById('pay').disabled,true);
  assert.match(w.document.getElementById('message').textContent,/Prüfung/);
  assert.equal(await ledger.pendingCount(),before);
  assert.notEqual(w.localStorage.getItem('bringness.offline.pending-sale.v1'),null);
 }finally{w.close();}
 // A lost local answer remains recoverable after a background catalog update.
 const pending=request();await ledger.sale(pending);const countBefore=await ledger.pendingCount();
 const fresh={...snapshot,id:uuid(),products:[{...snapshot.products[0],priceCents:400}]};await ledger.catalog(fresh);
 const recovered=await windowFor(pending);
 try{
  await wait(()=>!recovered.document.getElementById('pay').disabled&&recovered.document.getElementById('items').children.length===1);
  assert.match(recovered.document.getElementById('total').textContent,/5,00/);
  await recovered.document.getElementById('pay').onclick();
  assert.equal(await ledger.pendingCount(),countBefore);
  assert.match(recovered.document.getElementById('products').textContent,/4,00/);
  assert.equal(recovered.localStorage.getItem('bringness.offline.pending-sale.v1'),null);
 }finally{recovered.close();}
 // A newer company view must win even when the older read finishes afterwards.
 for(const sale of await ledger.pending())await ledger.acknowledge(sale.id,{id:'cloud-'+sale.id,receiptNumber:'R-'+sale.id});
 const viewA=await ledger.view(),active=await windowFor();
 try{
  await wait(()=>active.document.getElementById('products').children.length===1);
  active.document.querySelector('#sales button').click();assert(active.document.getElementById('receipt').textContent);
  active.document.querySelector('#products button').click();assert.match(active.document.getElementById('total').textContent,/4,00/);
  const resolutions=[];active.offlinePOS.view=()=>new Promise(resolve=>resolutions.push(resolve));
  const older=active.triggerOfflineUpdate();
  const nextRestaurant=uuid(),nextProduct=uuid();
  await ledger.catalog({...fresh,id:uuid(),companyId:uuid(),restaurants:[{id:nextRestaurant,name:'Other company'}],products:[{id:nextProduct,restaurantId:nextRestaurant,name:'Other product',priceCents:700,taxRate:19}],merchant:{[nextRestaurant]:{businessName:'Other company'}}});
  const viewB=await ledger.view(),newer=active.triggerOfflineUpdate();
  resolutions[1](viewB);await newer;resolutions[0](viewA);await older;
  assert.match(active.document.getElementById('products').textContent,/Other product/);
  assert.match(active.document.getElementById('total').textContent,/0,00/);
  assert.equal(active.document.getElementById('receipt').textContent,'');assert.equal(active.document.getElementById('print').disabled,true);
  assert.equal(active.document.getElementById('sales').children.length,0);
 }finally{active.close();}
 console.log('Offline payment recovery passed: valid restaurant UUID, restart before/after durable commit, same-ID replay, original prices after catalog change, preserved invalid recovery data, company switch and delayed-view isolation.');
}finally{await db.close();}
