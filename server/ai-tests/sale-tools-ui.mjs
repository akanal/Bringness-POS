import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import {JSDOM} from 'jsdom';
const script=await fs.readFile(new URL('../../apps/web/public/pos/sale-tools.js',import.meta.url),'utf8'),rid=crypto.randomUUID(),pid=crypto.randomUUID();
function fixture(mode='retail'){
 const dom=new JSDOM('<section id="host"></section>',{runScripts:'outside-only',url:'https://pos.test/pos/'}),w=dom.window;Object.defineProperty(w,'crypto',{value:crypto.webcrypto});w.eval(script);
 let draft={items:[{productId:pid,qty:2}],...(mode==='trade'?{recipient:{name:'Buyer',street:'Street',postalCode:'10115',city:'Berlin',country:'Deutschland',vatId:''}}:{})};let locked=false;
 const tools=w.bnCreateSaleTools(w.document.getElementById('host'),{rid,mode,locked:()=>locked,hasPayment:()=>false,subtotal:()=>draft.items.reduce((s,i)=>s+i.qty*100,0),draft:()=>draft,load:d=>{draft=d},changed(){}});
 return {w,tools,q:s=>w.document.querySelector(s),get:()=>draft,lock:()=>{locked=true;tools.refresh()}};
}
for(const mode of ['retail','trade']){
 const f=fixture(mode),{w,tools,q}=f;let saved=null,calls=[],lose=true;
 w.api=async(path,opt)=>{calls.push({path,opt});if(opt){saved=JSON.parse(opt.body);if(lose)throw Error('lost ack');return {id:saved.id,version:1}}if(path.includes('?'))return {bons:[{id:saved.id,label:'<script>customer</script>',sales_mode:mode}]};return {id:saved.id,restaurant_id:rid,state:'parked',version:1,payload:{salesMode:mode,items:saved.items,discount:saved.discount,...saved.recipient?{recipient:saved.recipient}:{}}};};
 try{
  q('[data-kind]').value='percent';q('[data-value]').value='12,5';q('[data-apply]').click();assert.equal(tools.total(200),175);assert.equal(tools.extras().discount.value,1250);
  q('[data-label]').value='Test';await q('[data-park]').onclick();const command=w.localStorage.getItem('bringness.park.command.v1:'+rid+':'+mode);assert(command);assert.equal(f.get().items.length,1);
  lose=false;await q('[data-park]').onclick();assert.equal(f.get().items.length,0);assert.equal(JSON.parse(calls[0].opt.body).id,JSON.parse(calls[1].opt.body).id);assert.equal(tools.extras().discount,undefined);assert.equal(calls.some(c=>c.path.includes('/checkout')),false);
  await q('[data-list]').onclick();assert.equal(q('[data-bons] script'),null);await q('[data-bons] button').onclick();assert.equal(f.get().items[0].qty,2);assert.equal(tools.extras().parkedBonId,saved.id);assert.equal(tools.total(200),175);
  f.lock();assert(q('[data-apply]').disabled);assert(q('[data-park]').disabled);
 }finally{w.close()}
}
const f=fixture();try{f.q('[data-value]').value='2,00';f.q('[data-apply]').click();assert.equal(f.tools.extras().discount,undefined);assert.match(f.q('[data-feedback]').textContent,/kleiner/);f.q('[data-kind]').value='percent';f.q('[data-value]').value='101';f.q('[data-apply]').click();assert.equal(f.tools.extras().discount,undefined)}finally{f.w.close()}
console.log('Sale tools UI passed for retail and trade: percent cents, excessive discount refusal, exact park retry after lost ack, no checkout on parking, escaped labels, restore discount/cart and lock during uncertain payment.');
