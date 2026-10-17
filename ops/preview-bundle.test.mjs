import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,stat,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createPreviewEnv} from './create-preview-env.mjs';
const config=JSON.parse(await readFile(new URL('./isolated-preview.compose.json',import.meta.url),'utf8'));
test('preview containers have a private internal network and no production mounts or public database port',()=>{
 assert.equal(config.name,'bringness-isolated-preview');assert.deepEqual(config.networks,{preview_private:{internal:true}});
 const app=config.services['preview-app'],db=config.services['preview-db'];
 assert.deepEqual(app.ports,['127.0.0.1:3016:3000']);assert.equal(db.ports,undefined);assert.equal(app.read_only,true);assert.deepEqual(app.cap_drop,['ALL']);assert.deepEqual(app.networks,['preview_private']);assert.deepEqual(db.networks,['preview_private']);
 assert.equal(app.env_file,undefined);assert.equal(app.volumes,undefined);assert.deepEqual(db.volumes,['preview_data:/var/lib/postgresql/data']);
 assert.equal(app.environment.BRINGNESS_PREVIEW_MODE,'isolated');assert.equal(app.environment.NODE_ENV,'development');
 assert(!Object.keys(app.environment).some(key=>/SMTP_|MOLLIE_|FISKALY_|VAPID_|NETCUP_|RAILWAY_/.test(key)));
 const serialized=JSON.stringify(config);for(const value of ['/opt/bringness/app','bringness-internal','docker.sock','network_mode','privileged','external'])assert(!serialized.includes(value));
});
test('preview credentials are private, independent and never overwrite an existing configuration',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'bringness-preview-env-')),file=path.join(dir,'.env.preview.local');
 try{
  await createPreviewEnv(file);const contents=await readFile(file,'utf8'),values=contents.trim().split('\n').map(line=>line.split('=').slice(1).join('='));
  assert.equal(values.length,6);assert.equal(new Set(values).size,6);assert(values.every(value=>value.length>=32));assert.equal((await stat(file)).mode&0o777,0o600);
  await assert.rejects(createPreviewEnv(file),error=>error.code==='EEXIST');assert.equal(await readFile(file,'utf8'),contents);
 }finally{await rm(dir,{recursive:true,force:true});}
});
