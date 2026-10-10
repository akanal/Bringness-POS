import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../apps/web/public/pos/personnel.js',import.meta.url),'utf8');
function client(responses,granted=true){
 const calls=[];let prompts=0;
 const window={fetch:async(input,init)=>{calls.push({input,init});return responses.shift()}};
 const context={navigator:{userAgent:"Desktop"},window,URL,Headers,Request,location:{href:'https://pos.example/pos/',origin:'https://pos.example'},document:{createElement:()=>({}),head:{appendChild(){}},getElementById:()=>({}),addEventListener(){},querySelectorAll:()=>[]},localStorage:{getItem:()=> 'session'},setInterval(){}};
 vm.runInNewContext(source,context);
 window.ensurePersonnelAccess=async()=>{prompts++;return granted};
 return {window,calls,prompts:()=>prompts};
}
const locked=()=>new Response(JSON.stringify({error:'Verwaltungs-PIN erforderlich'}),{status:403});
test('missing display grant prompts for PIN and retries the rejected request once',async()=>{
 const c=client([locked(),new Response('{}')]);const result=await c.window.fetch('/api/v1/displays?restaurantId=1');assert.equal(result.status,200);assert.equal(c.prompts(),1);assert.equal(c.calls.length,2);
});
test('cancelled PIN leaves the request rejected and does not retry a write',async()=>{
 const c=client([locked()],false);const result=await c.window.fetch('/api/v1/displays',{method:'POST',body:'{}'});assert.equal(result.status,403);assert.equal(c.calls.length,1);
});
test('a second rejection does not loop',async()=>{
 const c=client([locked(),locked()]);assert.equal((await c.window.fetch('/api/v1/personnel/employees')).status,403);assert.equal(c.prompts(),1);assert.equal(c.calls.length,2);
});
test('unrelated permissions and PIN setup are not retried',async()=>{
 for(const path of ['/api/v1/personnel/unlock','/api/v1/personnel/setup','https://other.example/api/v1/displays']){const c=client([locked()]);await c.window.fetch(path);assert.equal(c.prompts(),0);assert.equal(c.calls.length,1)}
 const c=client([new Response('{"error":"Keine Berechtigung"}',{status:403})]);await c.window.fetch('/api/v1/displays');assert.equal(c.prompts(),0);
});
test('Request bodies and authorization survive retry without trusting an old grant',async()=>{
 const c=client([locked(),new Response('{}')]);const request=new Request('https://pos.example/api/v1/displays',{method:'POST',body:'{"name":"Theke"}',headers:{authorization:'Bearer session','x-personnel-unlock':'stale'}});await c.window.fetch(request);assert.equal(await c.calls[1].input.text(),'{"name":"Theke"}');assert.equal(c.calls[1].init.headers.get('authorization'),'Bearer session');assert.equal(c.calls[1].init.headers.has('x-personnel-unlock'),false);
});
