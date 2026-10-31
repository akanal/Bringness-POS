import test from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import http from 'node:http';
import {fixture} from './fixture.mjs';
import {dependency} from './dependency.mjs';
import {createMarketplaceRuntime} from '../../server/shop-marketplace-http.js';
import {readMarketplaceCreditOverview as read} from '../../server/shop-marketplace-credit-overview.js';
import {mountMarketCredit} from '../../apps/web/public/shop/market-credit-ui.js';
const {JSDOM}=await import(pathToFileURL(dependency('jsdom','SHOP_JSDOM_PATH')));
async function setup(){const f=await fixture();f.runtime=createMarketplaceRuntime(f.pool,{enabled:true});await f.runtime.migrate();return f;}
test('credit overview authenticates company and reads without creating a financial account',async()=>{const f=await setup();try{
 const empty=await read(f.pool,{token:'owner-a'});assert.equal(empty.accountExists,false);assert.equal(empty.balanceNetCents,0);assert.equal((await f.db.query('SELECT * FROM shop_market_credit_accounts')).rows.length,0);
 await f.db.query('INSERT INTO shop_market_credit_accounts(company_id,balance_cents) VALUES($1,500)',[f.a]);
 for(const token of ['waiter','inactive','reset','expired'])await assert.rejects(()=>read(f.pool,{token}));
 assert.equal((await read(f.pool,{token:'owner-a'})).balanceNetCents,500);assert.equal((await read(f.pool,{token:'owner-b'})).accountExists,false);
 assert.equal((await f.db.query('SELECT * FROM shop_market_credit_accounts')).rows.length,1);
}finally{await f.db.close();}});
test('bounded journal hides internal references and retains total balance and payout qualification',async()=>{const f=await setup();try{
 await f.db.query("INSERT INTO shop_market_credit_accounts VALUES($1,510,'private-termination',clock_timestamp())",[f.a]);
 for(let i=0;i<51;i++)await f.db.query("INSERT INTO shop_market_credit_entries VALUES($1,'refund',$2,'private-digest',10,$3,clock_timestamp())",[f.a,'private-ref-'+i,{private:'not for response'}]);
 const r=await read(f.pool,{token:'owner-a'});assert.equal(r.entries.length,50);assert.equal(r.hasMore,true);assert.equal(r.balanceNetCents,510);assert.equal(r.payoutEligible,true);assert.equal(JSON.stringify(r).includes('private'),false);assert.equal(r.automaticSettlementEnabled,false);
}finally{await f.db.close();}});
test('credit HTTP is authenticated, query-strict, no-store and does not expose a write action',async()=>{const f=await setup();let server;try{
 server=http.createServer(async(req,res)=>{if(!await f.runtime.handle(req,res)){res.writeHead(404);res.end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port+'/api/v1/shop/marketplace/merchant-credit';
 assert.equal((await fetch(base)).status,401);assert.equal((await fetch(base+'?companyId='+f.b,{headers:{Authorization:'Bearer owner-a'}})).status,400);
 const r=await fetch(base,{headers:{Authorization:'Bearer owner-a'}});assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'no-store');assert.equal((await r.json()).accountExists,false);
 assert.equal((await fetch(base,{method:'POST',headers:{Origin:'https://bringness.de','Content-Type':'application/json',Authorization:'Bearer owner-a'},body:'{}'})).status,400);
}finally{if(server)await new Promise(r=>server.close(r));await f.db.close();}});
const response=()=>({currency:'EUR',policy:'merchant-credit-termination-v1',accountExists:true,balanceNetCents:500,payoutEligible:false,limit:50,hasMore:false,entries:[{kind:'refund',amountNetCents:500,createdAt:'2026-10-31T08:00:00Z'}],automaticSettlementEnabled:false,canPay:false});
function ui(call){const dom=new JSDOM('<div id="host"></div>',{url:'https://bringness.de',pretendToBeVisual:true});dom.window.localStorage.setItem('bringness-pos-token','seller');const host=dom.window.document.getElementById('host');return {dom,host,ui:mountMarketCredit({window:dom.window,host,client:{call}})};}
test('credit UI shows recorded net amounts and removes private history after account changes',async()=>{const f=ui(async()=>response());try{await f.ui.refresh();assert.match(f.host.textContent,/5,00/);assert.match(f.host.textContent,/noch nicht aktiviert/);f.dom.window.dispatchEvent(new f.dom.window.StorageEvent('storage',{key:'bringness-pos-token'}));assert.doesNotMatch(f.host.textContent,/5,00/);}finally{f.dom.window.close();}});
test('late credit reply after privacy event or changed token cannot restore private data',async()=>{for(const change of ['privacy','token']){let finish;const f=ui(()=>new Promise(r=>finish=r));try{const pending=f.ui.refresh();if(change==='privacy')f.ui.privacy();else f.dom.window.localStorage.setItem('bringness-pos-token','other');finish(response());await pending;assert.doesNotMatch(f.host.textContent,/5,00/);}finally{f.dom.window.close();}}});
test('malformed amounts or unknown journal types are rejected without displaying previous data',async()=>{for(const patch of [{balanceNetCents:-1},{balanceNetCents:1.5},{currency:'USD'},{entries:[{kind:'unknown',amountNetCents:1,createdAt:'2026-10-31'}]},{entries:[{kind:'offset',amountNetCents:1,createdAt:'2026-10-31'}]}]){const f=ui(async()=>({...response(),...patch}));try{await f.ui.refresh();assert.doesNotMatch(f.host.textContent,/5,00/);assert.match(f.host.textContent,/Nicht bestätigt/);}finally{f.dom.window.close();}}});

test('seller order shows stored five percent net commission without treating unpaid orders as charges',async()=>{
 const {mountMarketOrderViews}=await import('../../apps/web/public/shop/market-order-ui.js');
 const {marketplaceCommission}=await import('../../server/shop-marketplace-commission.js');
 const dom=new JSDOM('<button id="seller-orders-load"></button><p id="seller-orders-status"></p><div id="seller-orders"></div>',{url:'https://bringness.de',pretendToBeVisual:true});
 const row={id:'synthetic',reference:'M-TEST',status:'received',revision:0,paymentStatus:'unpaid',canPay:false,lines:[],grossCents:13090,method:'shipping',recipient:{name:'Test',street:'Test 1',postalCode:'10115',city:'Berlin',country:'DE',email:'test@example.test'},updatedAt:'2026-10-31T08:00:00Z',commission:marketplaceCommission(10000)};
 const ui=mountMarketOrderViews({window:dom.window,seller:true,client:{call:async()=>({orders:[row]})}});
 try{await ui.refresh();const text=dom.window.document.getElementById('seller-orders').textContent;assert.match(text,/5,00/);assert.match(text,/100,00/);assert.match(text,/Noch kein Provisionsabzug bestätigt/);}finally{dom.window.close();}
});
test('focus recheck and offline event remove an already rendered credit balance',async()=>{for(const event of ['focus','offline']){const f=ui(async()=>response());try{await f.ui.refresh();assert.match(f.host.textContent,/5,00/);if(event==='focus')f.dom.window.localStorage.setItem('bringness-pos-token','other');f.dom.window.dispatchEvent(new f.dom.window.Event(event));assert.doesNotMatch(f.host.textContent,/5,00/);}finally{f.dom.window.close();}}});
