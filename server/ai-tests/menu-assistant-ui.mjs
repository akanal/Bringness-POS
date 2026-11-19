import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import {JSDOM} from 'jsdom';
import {renderMenu} from '../../apps/web/public/ai-menu.js';
const dom=new JSDOM('<main id="root"></main>',{url:'https://local.test/'});globalThis.document=dom.window.document;
const root=document.getElementById('root'),loc=randomUUID(),recipe=randomUUID();let active=true,requests=[];
const content={title:'<img src=x onerror=alert(1)>',items:[{recipeId:recipe,name:'Suppe',category:'Suppen',description:'<script>bad()</script>',priceCents:650,visible:true}]};
let data={settings:{enabled:true,readCosts:false,readStock:false,version:1},card:null,drafts:[{id:randomUUID(),content,state:'draft',version:1}],recipes:[{id:recipe,name:'Suppe',active:true}],suggestions:[]};
const api=async(path,b)=>{requests.push({path,b});if(path==='locations')return {locations:[{id:loc,name:'Restaurant'}]};if(path.startsWith('menu?'))return data;if(path==='menu/decide'){data={...data,drafts:[]};return {state:'approved'}};if(path==='menu/draft'){data={...data,drafts:[]};return {draft:{id:b.id}}}throw Error('Unexpected '+path)};
try{
 await renderMenu({api,root,active:()=>active});assert.equal(root.querySelectorAll('img,script').length,0);assert(root.textContent.includes(content.title));
 const decision=root.querySelector('[data-menu-drafts] form'),submitter=decision.querySelector('[value="approve"]');
 assert.equal(requests.filter(r=>r.path==='menu/decide').length,0);decision.elements.namedItem('confirmed').checked=true;
 decision.dispatchEvent(new dom.window.SubmitEvent('submit',{bubbles:true,cancelable:true,submitter}));await new Promise(r=>setTimeout(r,0));
 const approved=requests.find(r=>r.path==='menu/decide');assert.equal(approved.b.confirmed,true);assert.equal(approved.b.decision,'approve');
 root.querySelector('[data-menu-create]').click();const f=root.querySelector('[data-menu-form] form');f.elements.namedItem('price-0').value='6.50';f.dispatchEvent(new dom.window.SubmitEvent('submit',{bubbles:true,cancelable:true}));await new Promise(r=>setTimeout(r,0));
 assert.equal(requests.find(r=>r.path==='menu/draft').b.content.items[0].priceCents,650);
 let finish;const pending=new Promise(r=>finish=r);const old=renderMenu({api:()=>pending,root,active:()=>active});active=false;root.textContent='Neue Ansicht';finish({locations:[{id:loc,name:'Old'}]});await old;assert.equal(root.textContent,'Neue Ansicht');
 console.log('Menu assistant DOM acceptance passed: escaped preview, explicit decision payload, editable draft cents and stale-view isolation.');
}finally{dom.window.close();delete globalThis.document;}
