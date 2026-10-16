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
