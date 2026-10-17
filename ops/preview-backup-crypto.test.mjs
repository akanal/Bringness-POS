import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {mkdtemp,readFile,writeFile,stat,rm,chmod} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createBackupKey,encryptBackup,decryptBackup} from './preview-backup-crypto.mjs';
test('encrypted preview backup restores exact bytes, uses fresh IVs and refuses overwrites',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'preview-backup-'));const p=name=>path.join(dir,name);
 try{
  await createBackupKey(p('key'));await assert.rejects(createBackupKey(p('key')), {code:'EEXIST'});
  const data=Buffer.from('private environment and database rows\n'.repeat(10000));
  for(const name of ['a','b'])await encryptBackup(Readable.from([data]),p(name),p('key'));
  assert.notDeepEqual(await readFile(p('a')),await readFile(p('b')));assert(!(await readFile(p('a'))).includes(Buffer.from('private environment')));
  await decryptBackup(p('a'),p('restored'),p('key'));assert.deepEqual(await readFile(p('restored')),data);
  for(const name of ['key','a','restored'])assert.equal((await stat(p(name))).mode&0o777,0o600);
  await assert.rejects(encryptBackup(Readable.from(['changed']),p('a'),p('key')),{code:'EEXIST'});
  await assert.rejects(decryptBackup(p('b'),p('restored'),p('key')),{code:'EEXIST'});assert.deepEqual(await readFile(p('restored')),data);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('wrong key, modified ciphertext, changed header and truncation never leave restorable SQL',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'preview-backup-'));const p=name=>path.join(dir,name);
 try{
  await createBackupKey(p('key'));await createBackupKey(p('wrong'));await encryptBackup(Readable.from(['SELECT secret;\n'.repeat(100)]),p('original'),p('key'));
  const original=await readFile(p('original'));
  for(const [name,mutate] of [['tag',b=>{b[b.length-1]^=1;return b;}],['cipher',b=>{b[45]^=1;return b;}],['header',b=>{b[0]^=1;return b;}],['truncated',b=>b.subarray(0,b.length-9)]]){
   await writeFile(p(name),mutate(Buffer.from(original)));await assert.rejects(decryptBackup(p(name),p('out'),p('key')));await assert.rejects(stat(p('out')),{code:'ENOENT'});
  }
  await assert.rejects(decryptBackup(p('original'),p('out'),p('wrong')));await assert.rejects(stat(p('out')),{code:'ENOENT'});
  await chmod(p('key'),0o644);await assert.rejects(encryptBackup(Readable.from(['sql']),p('unsafe'),p('key')),/private regular/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
