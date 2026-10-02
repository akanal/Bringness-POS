import test from "node:test";
import assert from "node:assert/strict";
import {Readable} from "node:stream";
import {createQrService,queueOrder,validMode} from "./qr-service-core.js";
import vm from "node:vm";
import fs from "node:fs";

const rid="11111111-1111-4111-8111-111111111111";
const oid="22222222-2222-4222-8222-222222222222";
const key="33333333-3333-4333-8333-333333333333";
const user={id:rid,company_id:rid,role:"owner"};
function db(respond){
  const calls=[];
  const pool={calls,async query(sql,args){calls.push({sql,args});return respond(sql,args)},async connect(){return {...pool,release(){}}}};
  return pool;
}
async function request(pool,path,{method="GET",payload,auth=true}={}){
  const req=Readable.from(payload===undefined?[]:[JSON.stringify(payload)]);
  req.url=path;req.method=method;req.headers=auth?{authorization:"Bearer session"}:{};
  const res={writeHead(status,headers){this.status=status;this.headers=headers},end(text){this.data=JSON.parse(text)}};
  assert.equal(await createQrService(pool)(req,res),true);
  return res;
}
const rows=(...rows)=>({rows,rowCount:rows.length});
test("queue is oldest first with deterministic ties and intact table tickets",()=>{
  const input=[{id:"b",table_id:"T2",created_at:"2026-10-02T12:02Z",items:[1,2]},{id:"a",table_id:"T1",created_at:"2026-10-02T12:01Z",items:[3,4]}];
  assert.deepEqual(queueOrder(input).map(x=>x.id),["a","b"]);
  assert.deepEqual(queueOrder(input)[0].items,[3,4]);
  assert.equal(input[0].id,"b");
  assert.equal(validMode("both"),false);
});
test("guest lookup requires exact order and request IDs; only minimal collection data escapes",async()=>{
  const pool=db((sql,args)=>{
    assert.match(sql,/guest_request_id=\$2/);
    return args[1]===key?rows({id:oid,qr_service_mode:"pickup",qr_ready_at:"now",status:"open"}):rows();
  });
  const ok=await request(pool,"/api/v1/guest/collection?orderId="+oid+"&requestId="+key,{auth:false});
  assert.equal(ok.data.ready,true);assert.equal(ok.data.number,oid.slice(0,8).toUpperCase());
  assert.equal("requestId" in ok.data,false);assert.equal(ok.headers["cache-control"],"no-store");
  const bad=await request(pool,"/api/v1/guest/collection?orderId="+oid+"&requestId="+rid,{auth:false});
  assert.equal(bad.status,404);
});
test("mode selection is owner-only and rejects mixed models",async()=>{
  let pool=db(sql=>sql.includes("FROM sessions")?rows({...user,role:"waiter"}):rows());
  assert.equal((await request(pool,"/api/v1/restaurants/"+rid+"/qr-service",{method:"PUT",payload:{mode:"pickup"}})).status,403);
  pool=db(sql=>sql.includes("FROM sessions")?rows(user):rows());
  assert.equal((await request(pool,"/api/v1/restaurants/"+rid+"/qr-service",{method:"PUT",payload:{mode:"both"}})).status,400);
  assert.equal(pool.calls.some(x=>x.sql.startsWith("UPDATE")),false);
});
test("model switch locks the restaurant and rejects unfinished orders, including prepaid pickup",async()=>{
  const pool=db(sql=>sql.includes("FROM sessions")?rows(user):sql.startsWith("SELECT qr_service_mode")?rows({qr_service_mode:"restaurant"}):sql.startsWith("SELECT 1 FROM orders")?rows({one:1}):rows());
  const result=await request(pool,"/api/v1/restaurants/"+rid+"/qr-service",{method:"PUT",payload:{mode:"pickup"}});
  assert.equal(result.status,409);
  assert.ok(pool.calls.some(x=>x.sql.includes("FOR UPDATE")));
  assert.ok(pool.calls.some(x=>x.sql.includes("qr_ready_at IS NULL")));
  assert.ok(pool.calls.some(x=>x.sql==="ROLLBACK"));
  assert.equal(pool.calls.some(x=>x.sql.startsWith("UPDATE")),false);
});
test("ready confirmation is idempotent and never changes financial status",async()=>{
  const pool=db(sql=>sql.includes("FROM sessions")?rows(user):sql.startsWith("SELECT o.id")?rows({id:oid,restaurant_id:rid,table_id:rid,status:"paid",qr_service_mode:"pickup"}):rows());
  for(let i=0;i<2;i++)assert.equal((await request(pool,"/api/v1/orders/"+oid+"/collection-ready",{method:"POST"})).status,200);
  const updates=pool.calls.filter(x=>x.sql.startsWith("UPDATE"));
  assert.equal(updates.length,2);
  assert.ok(updates.every(x=>x.sql==="UPDATE orders SET qr_ready_at=coalesce(qr_ready_at,now()) WHERE id=$1"));
});
test("waiter cannot notify a different waiter's table",async()=>{
  const pool=db(sql=>sql.includes("FROM sessions")?rows({...user,role:"waiter"}):sql.startsWith("SELECT o.id")?rows({id:oid,restaurant_id:rid,table_id:rid,status:"open",qr_service_mode:"pickup"}):rows());
  const result=await request(pool,"/api/v1/orders/"+oid+"/collection-ready",{method:"POST"});
  assert.equal(result.status,403);
  assert.equal(pool.calls.some(x=>x.sql.startsWith("UPDATE")),false);
});
test("repeat guest submissions keep the menu open and use the supplied independent request IDs",async()=>{
  const events=[],requests=[];
  const context={
    location:{search:"?code="+"a".repeat(48)},URLSearchParams,
    document:{getElementById:id=>id==="guestReceiptEmail"?{value:""}:null,querySelectorAll:()=>[],documentElement:{}},
    MutationObserver:class{observe(){}},CustomEvent:class{constructor(type,init){this.type=type;this.detail=init.detail}},
    window:{async fetch(url,init){requests.push({url,body:init?.body});return {ok:true,async json(){return {extras:[]}},clone(){return {async json(){return {orderId:oid}}}}}},dispatchEvent:e=>events.push(e)},
  };
  vm.runInNewContext(fs.readFileSync(new URL("../apps/web/public/tisch/guest-enhancements.js",import.meta.url),"utf8"),context);
  for(const requestId of [key,rid])await context.window.fetch("/api/v1/guest/order",{body:JSON.stringify({requestId,items:[]})});
  assert.deepEqual(events.map(e=>e.detail.requestId),[key,rid]);
  assert.equal(requests.filter(x=>x.url==="/api/v1/guest/order-v2").length,2);
});
test("guest collection alerts once without a permission dialog or app registration",async()=>{
  const elements=new Map(),listeners={},timers=[],storage=new Map();
  let vibrations=0,tones=0,ready=false;
  const make=()=>({style:{},children:[],setAttribute(){},replaceChildren(){this.children=[]},appendChild(x){this.children.push(x);if(x.id)elements.set(x.id,x)}});
  const parent=make();elements.set("status",{parentElement:parent});
  const context={
    URLSearchParams,location:{search:"?code="+"a".repeat(48)},
    sessionStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},
    document:{hidden:false,body:parent,getElementById:id=>elements.get(id),createElement:make,addEventListener:(type,fn)=>listeners[type]=fn},
    navigator:{vibrate(){vibrations++}},
    window:{addEventListener:(type,fn)=>listeners[type]=fn,AudioContext:class{
      state="running";currentTime=0;destination={};
      async resume(){}
      createOscillator(){return {frequency:{},connect(){},start(){tones++},stop(){}}}
      createGain(){return {gain:{setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){}}}
    }},
    setInterval:fn=>timers.push(fn),
    async fetch(url){return {ok:true,async json(){return url.includes("service-mode")?{mode:"pickup"}:{orderId:oid,number:"22222222",mode:"pickup",ready,closed:false}}}},
  };
  vm.runInNewContext(fs.readFileSync(new URL("../apps/web/public/tisch/collection.js",import.meta.url),"utf8"),context);
  const flush=()=>new Promise(resolve=>setImmediate(resolve));
  await flush();listeners.pointerdown();
  listeners["bringness-guest-order"]({detail:{orderId:oid,requestId:key}});
  await flush();assert.equal(vibrations,0);
  ready=true;await timers[0]();await timers[0]();
  assert.equal(vibrations,1);assert.equal(tones,3);
  assert.ok(elements.get("guestCollection").children[0].textContent.includes("Bitte am Tresen abholen"));
});

test("pickup closes ordering until a fresh QR URL is opened; failed orders remain retryable",async()=>{
  function page({collection=false,success=true}={}){
    const code="a".repeat(48),requests=[],events=[],replaced=[];
    const elements=new Map(["menu","basket","total","send","language","heading","status"].map(id=>[id,{hidden:false,disabled:false,textContent:""}]));
    elements.set("guestReceiptEmail",{value:"",parentElement:{hidden:false}});
    const context={
      URL,URLSearchParams,Response,
      location:{search:"?"+(collection?"collection":"code")+"="+code,href:"https://example.test/tisch/?"+(collection?"collection":"code")+"="+code},
      history:{replaceState:(state,title,url)=>replaced.push(url)},
      document:{getElementById:id=>elements.get(id),querySelectorAll:()=>[],documentElement:{}},
      MutationObserver:class{observe(){}},CustomEvent:class{constructor(type,init){this.type=type;this.detail=init.detail}},
      window:{async fetch(url,init){
        requests.push(url);
        if(url==="/api/v1/guest/order-v2")return new Response(JSON.stringify(success?{orderId:oid}:{error:"retry"}),{status:success?200:503});
        return new Response(JSON.stringify(url.includes("extras")?{extras:[]}:{mode:"pickup"}));
      },dispatchEvent:e=>events.push(e)}
    };
    vm.runInNewContext(fs.readFileSync(new URL("../apps/web/public/tisch/guest-enhancements.js",import.meta.url),"utf8"),context);
    return {context,requests,events,replaced,elements};
  }
  const submit=p=>p.context.window.fetch("/api/v1/guest/order",{body:JSON.stringify({requestId:key,items:[]})});
  const first=page();
  assert.equal((await submit(first)).status,200);
  assert.equal((await submit(first)).status,409);
  assert.equal(first.requests.filter(u=>u==="/api/v1/guest/order-v2").length,1);
  assert.ok(first.elements.get("menu").hidden);
  assert.ok(first.elements.get("send").disabled);
  assert.ok(first.replaced[0].includes("collection="));
  assert.ok(!first.replaced[0].includes("?code="));
  assert.equal((await submit(page({collection:true}))).status,409);
  assert.equal((await submit(page())).status,200);
  const failed=page({success:false});
  assert.equal((await submit(failed)).status,503);
  assert.equal((await submit(failed)).status,503);
  assert.equal(failed.replaced.length,0);
});
