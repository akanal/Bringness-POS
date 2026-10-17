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
 const restaurant=uuid(),product=uuid();
 const snapshot={id:uuid(),companyId:uuid(),deviceKey:'a'.repeat(64),createdAt:new Date().toISOString(),validUntil:new Date(Date.now()+86400000).toISOString(),restaurants:[{id:restaurant,name:'Test'}],products:[{id:product,restaurantId:restaurant,name:'Coffee',priceCents:250,taxRate:19}],merchant:{[restaurant]:{businessName:'Test'}}};
 await ledger.catalog(snapshot);
 const html=await fs.readFile(new URL('../../apps/desktop/offline.html',import.meta.url),'utf8');
 const script=await fs.readFile(new URL('../../apps/desktop/offline-ui.js',import.meta.url),'utf8');
 const request=()=>({id:uuid(),snapshotId:snapshot.id,restaurantId:restaurant,createdAt:new Date().toISOString(),paymentMethod:'cash',items:[{productId:product,quantity:2}]});
 async function windowFor(pending){
  const dom=new JSDOM(html,{url:'https://offline.test/',runScripts:'outside-only'}),w=dom.window;
  Object.defineProperty(w,'crypto',{value:crypto.webcrypto});
  w.localStorage.setItem('bringness.offline.pending-sale.v1',JSON.stringify(pending));
  w.offlinePOS={view:()=>ledger.view(),sale:r=>ledger.sale(r),updated(){},sync:async()=>{},online:async()=>{}};
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
 console.log('Offline payment recovery passed: valid restaurant UUID, restart before/after durable commit, same-ID replay and preserved invalid recovery data.');
}finally{await db.close();}
