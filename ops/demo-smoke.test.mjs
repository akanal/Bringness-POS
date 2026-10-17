import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';

const html=readFileSync(new URL('../apps/web/public/demo/index.html',import.meta.url),'utf8');

test('demo has distinct POS, tables, kitchen and AI panels',()=>{
  for(const id of ['pos','tables','kitchen','ai'])assert.match(html,new RegExp('id="'+id+'"'));
});
test('demo contains no external script, network calls or persisted browser storage',()=>{
  assert.doesNotMatch(html,/<script[^>]+src=/i);
  assert.doesNotMatch(html,/\b(fetch|XMLHttpRequest|WebSocket|sendBeacon|localStorage|sessionStorage)\b/);
});
test('demo warns that orders and payments are not real',()=>{
  assert.match(html,/keine echten Zahlungen/);
  assert.match(html,/ausschließlich im Arbeitsspeicher/);
});
test('demo inline JavaScript parses',()=>{
  const match=html.match(/<script>([\s\S]*?)<\/script>/);
  assert.ok(match);
  new Script(match[1],{filename:'demo-inline.js'});
});

test('demo includes accessible navigation and essential action controls',()=>{
  for(const id of ['tabs','products','cart','total','submit','clear','table-grid','orders','stock','restock']){
    assert.match(html,new RegExp('id="'+id+'"'));
  }
  assert.match(html,/role="status"/);
  assert.match(html,/aria-selected="true"/);
});
test('demo avoids real payment and fiscal operations',()=>{
  assert.doesNotMatch(html,/https?:\/\//);
  assert.doesNotMatch(html,/mollie\.com|stripe\.com|\/api\/tse|payment\/checkout/i);
  assert.match(html,/keine TSE-Signatur/);
});
test('demo uses only temporary in-memory orders',()=>{
  assert.match(html,/const cart=new Map\(\),orders=\[\]/);
  assert.match(html,/orders\.push\(/);
  assert.match(html,/nextOrder\+\+/);
});

test('demo blocks network and external resources with a content security policy',()=>{
  assert.match(html,/http-equiv="Content-Security-Policy"/);
  assert.match(html,/default-src &#39;none&#39;/);
  assert.match(html,/connect-src &#39;none&#39;/);
  assert.match(html,/form-action &#39;none&#39;/);
});
