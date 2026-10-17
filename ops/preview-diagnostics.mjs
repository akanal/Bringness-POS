import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
const file=process.argv[2]||'.env.preview.local';
const values=(await readFile(file,'utf8')).trim().split('\n').map(line=>line.slice(line.indexOf('=')+1)).filter(value=>value.length>=8);
const result=spawnSync('docker',['compose','--env-file',file,'-f','ops/isolated-preview.compose.json','logs','--no-color','--tail','100'],{encoding:'utf8'});
let text=(result.stdout||'')+(result.stderr||'');for(const value of values)text=text.replaceAll(value,'[redacted]');text=text.replace(/Bearer\s+[A-Za-z0-9._-]+/gi,'Bearer [redacted]');process.stdout.write(text);
