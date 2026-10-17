import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
const root=new URL('../',import.meta.url);
const read=p=>readFileSync(new URL(p,root),'utf8');
test('preview must use existing Bringness POS interface, not a replacement mock',()=>{
 const pos=read('apps/web/public/pos/index.html');
 assert.match(pos,/<title>Online-Kasse – Bringness<\/title>/);
 assert.match(pos,/\/styles\.css/);
 assert.ok(existsSync(new URL('apps/web/public/pos/app.js',root)));
});
test('Bringness AI retains its own workspace and scripts',()=>{
 const ai=read('apps/web/public/ai-workspace.html');
 assert.match(ai,/<title>Mein Arbeitsbereich – Bringness AI<\/title>/);
 assert.match(ai,/\/ai-workspace\.css/);
 assert.match(ai,/\/ai-workspace\.js/);
 assert.doesNotMatch(ai,/\/pos\/app\.js/);
});
test('standalone mock is not the release target',()=>{
 const doc=read('docs/staging-provisioning-status.md');
 assert.match(doc,/standalone simulation, not the connected Bringness POS application/);
});
