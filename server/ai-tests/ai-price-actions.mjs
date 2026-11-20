import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {migratePosAiPrices,posAiPrices,expirePosAiPrices} from '../pos-ai-prices.js';
import {aiPriceTick} from '../ai-price-worker.js';

const pos=new PGlite(), ai=new PGlite();
const adapter=db=>({
 query:async(sql,args)=>{
  const result=args?await db.query(sql,args):(await db.exec(sql)).at(-1);
  return {...result,rowCount:result.affectedRows||result.rows.length};
 },
 connect:async()=>({...adapter(db),release(){}})
});
const p=adapter(pos), a=adapter(ai);
const ids=Object.fromEntries(['company','owner','staff','tenant','restaurant','product','otherProduct','account','location','link','stock','recipe','lot'].map(key=>[key,randomUUID()]));
const owner={id:ids.owner,role:'owner'}, staff={id:ids.staff,role:'waiter'};
const act=(method,body={},user=owner)=>posAiPrices(p,user,ids.restaurant,method,body);
const price=async()=>Number((await p.query('SELECT price_cents FROM products WHERE id=$1',[ids.product])).rows[0].price_cents);
try {
 await pos.exec(`
 CREATE TABLE restaurants(id uuid PRIMARY KEY,company_id uuid NOT NULL);
 CREATE TABLE users(id uuid PRIMARY KEY,company_id uuid NOT NULL,role text,status text,must_change_password boolean);
 CREATE TABLE products(id uuid PRIMARY KEY,restaurant_id uuid REFERENCES restaurants,name text,price_cents int,active boolean,ai_stock_available boolean);`);
 await ai.exec(`
 CREATE TABLE ai_accounts(id uuid PRIMARY KEY,status text,role text);
 CREATE TABLE ai_connectors(id uuid PRIMARY KEY,account_id uuid,location_id uuid,pos_restaurant_id uuid,pos_company_id uuid,pos_user_id uuid,kind text,active boolean);
 CREATE TABLE ai_stock(id uuid PRIMARY KEY,account_id uuid,location_id uuid,quantity numeric,reserved_quantity numeric);
 CREATE TABLE ai_stock_moves(id bigserial PRIMARY KEY,stock_id uuid);
 CREATE TABLE ai_stock_lots(id uuid PRIMARY KEY,account_id uuid,location_id uuid,stock_id uuid,quantity numeric,opening_state text,date_kind text,expires_on date,checked_on date,movement_at_check bigint,stock_at_check numeric);
 CREATE TABLE ai_recipes(id uuid PRIMARY KEY,account_id uuid,location_id uuid,external_code text,active boolean);
 CREATE TABLE ai_recipe_items(recipe_id uuid,stock_id uuid,quantity numeric);`);
 await p.query('INSERT INTO restaurants VALUES($1,$2)',[ids.restaurant,ids.company]);
 await p.query("INSERT INTO users VALUES($1,$2,'owner','active',false),($3,$2,'waiter','active',false),($4,$5,'owner','active',false)",[ids.owner,ids.company,ids.staff,ids.tenant,randomUUID()]);
 await p.query("INSERT INTO products VALUES($1,$2,'Suppe',490,true,true),($3,$2,'Beilage',300,true,true)",[ids.product,ids.restaurant,ids.otherProduct]);
 await migratePosAiPrices(p);
 await a.query("INSERT INTO ai_accounts VALUES($1,'active','restaurant')",[ids.account]);
 await a.query("INSERT INTO ai_connectors VALUES($1,$2,$3,$4,$5,$6,'pos',true)",[ids.link,ids.account,ids.location,ids.restaurant,ids.company,ids.owner]);
 await a.query('INSERT INTO ai_stock VALUES($1,$2,$3,12,0)',[ids.stock,ids.account,ids.location]);
 await a.query("INSERT INTO ai_stock_lots VALUES($1,$2,$3,$4,12,'sealed','use_by',current_date,current_date,0,12)",[ids.lot,ids.account,ids.location,ids.stock]);
 await a.query('INSERT INTO ai_recipes VALUES($1,$2,$3,$4,true)',[ids.recipe,ids.account,ids.location,ids.product]);
 await a.query('INSERT INTO ai_recipe_items VALUES($1,$2,1)',[ids.recipe,ids.stock]);
 await a.query("UPDATE ai_stock_lots SET expires_on=(now() AT TIME ZONE 'Europe/Berlin')::date,checked_on=(now() AT TIME ZONE 'Europe/Berlin')::date");
 const approval={action:'enable',confirmed:true,productIds:[ids.product],discountPercent:20,durationMinutes:30};
 assert.equal((await act('GET')).rule.enabled,false);
 assert.equal((await act('GET')).linked,false);
 await assert.rejects(act('POST',approval),{status:409});
 await aiPriceTick(a,p);
 assert.equal((await act('GET')).linked,true);
 assert.equal(await price(),490);
 await assert.rejects(act('POST',approval,staff),{status:403});
 await assert.rejects(act('GET',{}, {id:ids.tenant,role:'owner'}),{status:404});
 await assert.rejects(act('POST',{...approval,confirmed:false}),{status:400});
 await act('POST',approval);
 await assert.rejects(act('POST',{...approval,discountPercent:30}),{status:409});
 await aiPriceTick(a,p);
 assert.equal(await price(),490,'use-by batches do not trigger automatic reductions');
 await a.query("UPDATE ai_stock_lots SET date_kind='best_before',movement_at_check=1");
 await aiPriceTick(a,p);
 assert.equal(await price(),490,'a stale lot check cannot trigger automatic reductions');
 await a.query('UPDATE ai_stock_lots SET movement_at_check=0');
 await aiPriceTick(a,p);
 await aiPriceTick(a,p);
 assert.equal(await price(),392);
 assert.equal((await act('GET',{},staff)).canManage,false);
 assert.equal((await act('GET',{},staff)).prices[0].price_cents,392);
 const [action]= (await act('GET')).actions;
 assert.equal(action.regular_cents,490);
 await act('POST',{action:'undo',id:action.id});
 await aiPriceTick(a,p);
 assert.equal(await price(),490,'undo also prevents the worker from repeating the same daily reduction');
 // Move the historical marker to the previous day to exercise fresh actions.
 await p.query('UPDATE pos_ai_price_actions SET sale_day=sale_day-1');
 await aiPriceTick(a,p);
 await p.query('UPDATE products SET price_cents=510 WHERE id=$1',[ids.product]);
 assert.equal((await act('GET')).actions.length,0);
 await act('POST',{action:'disable'});
 assert.equal(await price(),510,'revocation preserves manually changed prices');
 await p.query('DELETE FROM pos_ai_price_actions');
 await act('POST',{...approval,minimumPrices:{[ids.product]:425}});
 await aiPriceTick(a,p);
 await p.query("UPDATE pos_ai_price_actions SET ends_at=now()-interval '1 minute' WHERE ended_at IS NULL");
 assert.equal(await expirePosAiPrices(p),1);
 assert.equal(await price(),510,'expiry restores the regular price');
 await p.query('DELETE FROM pos_ai_price_actions');
 await aiPriceTick(a,p);
 assert.equal(await price(),425);
 await act('POST',{action:'disable'});
 assert.equal(await price(),510);
 assert.equal((await act('GET')).rule.enabled,false);
 console.log('POS AI pricing passed: opt-in, tenant authorization, fresh best-before stock, price changes, daily undo, manual preservation, expiry and revocation.');
} finally {await a.query('ROLLBACK');await p.query('ROLLBACK');await ai.close();await pos.close()}

const {JSDOM}=await import('jsdom');
const {readFile}=await import('node:fs/promises');
const markup=await readFile(new URL('../../apps/web/public/pos/index.html',import.meta.url),'utf8');
const script=await readFile(new URL('../../apps/web/public/pos/ai-prices.js',import.meta.url),'utf8');
const {window:w}=new JSDOM(markup,{url:'https://example.org/pos/',runScripts:'outside-only'});
try {
 const state={token:'test',restaurantId:ids.restaurant};
 const rule={enabled:true,product_ids:[ids.product],discount_percent:20,duration_minutes:30};
 let actions=[{id:ids.recipe,product_name:'Suppe',regular_cents:490,action_cents:392,ends_at:'2026-11-20T17:00:00Z'}];
 const calls=[];
 let linked=true;
 w.eval(script);
 const refresh=w.bnPosAiPrices.connect({
  context:()=>state,
  products:()=>[{id:ids.product,name:'Suppe'}],
  setPrices:()=>{},
  api:async(_path,options)=>{
   if(options){calls.push(JSON.parse(options.body));actions=[];}
   return {canManage:true,linked,rule,actions,prices:[]};
  }
 });
 await refresh();
 const banner=w.document.getElementById('aiPrices');
 assert.equal(banner.hidden,false);
 assert.match(banner.textContent,/Suppe.*4,90.*3,92.*18:00/);
 banner.querySelector('button').click();
 await new Promise(resolve=>setTimeout(resolve,0));
 assert.deepEqual(calls,[{action:'undo',id:ids.recipe}]);
 assert.equal(banner.hidden,true);
 const settings=w.document.getElementById('aiPricesSettings');
 assert.equal(settings.hidden,false);
 assert.match(settings.textContent,/Bringness AI/);
 rule.enabled=false;linked=false;
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true};
 w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'))};
 await refresh();settings.click();
 let dialog=w.document.getElementById('aiPricesDialog');
 assert.match(dialog.textContent,/keine aktive Bringness-AI-Verbindung/);
 assert.match(dialog.querySelector('a').href,/bringness-ai.com/);
 assert.equal(dialog.querySelector('input'),null);
 dialog.close();linked=true;await refresh();settings.click();
 dialog=w.document.getElementById('aiPricesDialog');
 assert.equal(dialog.querySelector('[name^="floor-"]').disabled,true);
 dialog.querySelector('[name="product"]').click();
 assert.equal(dialog.querySelector('[name^="floor-"]').disabled,false);
} finally {w.close()}
