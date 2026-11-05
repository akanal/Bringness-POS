import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import {redirectLegacyPosDomain} from './runtime-mode.js';
const root=fileURLToPath(new URL('../apps/web/public/',import.meta.url));
const source=fs.readFileSync(new URL('./index.js',import.meta.url),'utf8');
const routeFile=vm.runInNewContext('('+source.match(/^function routeFile\(url\)\{[^\n]+\}$/m)[0]+')',{root,path});
test('POS icon files are square high-resolution PNGs accessible without legacy-domain redirection',()=>{
 for(const [name,size] of [['bringness-pos-icon.png',96],['bringness-pos-touch-icon.png',180]]){
  const url='/assets/'+name,file=routeFile(url),bytes=fs.readFileSync(file);
  assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
  assert.equal(bytes.readUInt32BE(16),size);assert.equal(bytes.readUInt32BE(20),size);
  for(const host of ['bringness-pos.de','www.bringness-pos.de'])for(const method of ['GET','HEAD'])assert.equal(redirectLegacyPosDomain({method,headers:{host},url},{writeHead(){throw Error('icon must remain directly crawlable')}},'pos',{NODE_ENV:'production'}),false);
 }
});
test('all dedicated POS marketing pages declare the same stable own-host favicon and touch icon',()=>{
 for(const name of ['index.html','preise/index.html','ueber-uns/index.html','qr-bestellungen.html','vorfuehrung/index.html','demo/index.html','rechtliches/impressum/index.html','rechtliches/datenschutz/index.html']){
  const html=fs.readFileSync(path.join(root,name),'utf8');
  assert.equal((html.match(/rel="icon"/g)||[]).length,1,name);
  assert(html.indexOf('rel="icon"')<html.indexOf('</head>'),name);
  assert(html.includes('sizes="96x96" href="/assets/bringness-pos-icon.png"'),name);
  assert(html.includes('rel="apple-touch-icon" sizes="180x180" href="/assets/bringness-pos-touch-icon.png"'),name);
 }
});
