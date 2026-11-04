import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import {redirectLegacyPosDomain} from './runtime-mode.js';
const root=fileURLToPath(new URL('../apps/web/public',import.meta.url));
const legacy=fs.readFileSync(new URL('./index.js',import.meta.url),'utf8');
const source=legacy.match(/^function routeFile\(url\)\{[^\n]+\}$/m)?.[0];
assert(source,'actual static dispatcher must be inspectable');
const routeFile=vm.runInNewContext('('+source+')',{root,path});
test('actual production static dispatcher resolves POS introduction links and both required assets',()=>{
 for(const url of ['/vorfuehrung','/vorfuehrung/','/vorfuehrung/?utm_source=flyer','/vorfuehrung/index.html']){
  const file=routeFile(url);assert.equal(file,path.join(root,'vorfuehrung/index.html'));assert(fs.statSync(file).isFile());
  for(const host of ['bringness-pos.de','www.bringness-pos.de'])assert.equal(redirectLegacyPosDomain({method:'GET',headers:{host},url},{writeHead(){throw Error('must stay on POS domain')}},'pos',{NODE_ENV:'production'}),false);
 }
 for(const name of ['app.js','style.css'])assert(fs.statSync(routeFile('/vorfuehrung/'+name+'?v=20261104')).isFile());
 assert.equal(routeFile('/pos/'),path.join(root,'pos/index.html'));assert.equal(routeFile('/shop/'),path.join(root,'shop/index.html'));
});
