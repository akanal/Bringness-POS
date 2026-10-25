import {readFile,readdir} from 'node:fs/promises';import {spawn} from 'node:child_process';import {fileURLToPath} from 'node:url';
const root=new URL('../../',import.meta.url),env={...process.env};
try{for(const line of(await readFile(new URL('.env.shop-tests.local',root),'utf8')).split('\n')){const match=/^(SHOP_PGLITE_PATH|SHOP_JSDOM_PATH)=(.+)$/.exec(line);if(match&&!env[match[1]])env[match[1]]=match[2];}}catch(e){if(e.code!=='ENOENT')throw e;}
const files=(await readdir(new URL('./',import.meta.url))).filter(f=>f.endsWith('.test.mjs')).sort().map(f=>fileURLToPath(new URL(f,import.meta.url)));
const child=spawn(process.execPath,['--test','--test-concurrency=2',...files],{cwd:fileURLToPath(root),env,stdio:'inherit'});child.on('exit',(code,signal)=>{process.exitCode=code??(signal?1:0);});child.on('error',()=>{process.exitCode=1;});
