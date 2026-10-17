import crypto from 'node:crypto';
import {createReadStream,createWriteStream} from 'node:fs';
import {appendFile,open,readFile,unlink,lstat,writeFile} from 'node:fs/promises';
import {pipeline} from 'node:stream/promises';
import {createGzip,createGunzip} from 'node:zlib';
const magic=Buffer.from('BRINGNESS-PREVIEW-BACKUP-1\n');
async function privateKey(file){
 const info=await lstat(file);
 if(!info.isFile()||(info.mode&0o077)!==0)throw Error('Backup key must be a private regular file');
 const key=await readFile(file);if(key.length!==32)throw Error('Invalid backup key');return key;
}
export async function createBackupKey(file){await writeFile(file,crypto.randomBytes(32),{flag:'wx',mode:0o600});}
export async function encryptBackup(source,file,keyFile){
 const key=await privateKey(keyFile),iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key,iv);
 cipher.setAAD(magic);let created=false;
 try{
  await writeFile(file,Buffer.concat([magic,iv]),{flag:'wx',mode:0o600});created=true;
  await pipeline(source,createGzip(),cipher,createWriteStream(file,{flags:'a',mode:0o600}));
  await appendFile(file,cipher.getAuthTag());
 }catch(error){if(created)await unlink(file).catch(()=>{});throw error;}
}
// Always authenticate the complete backup into a private temporary file BEFORE
// handing any SQL to PostgreSQL. A failed GCM tag must never partially restore data.
export async function decryptBackup(file,target,keyFile){
 const key=await privateKey(keyFile),handle=await open(file,'r');let created=false;
 try{
  const {size}=await handle.stat();if(size<magic.length+12+16+20)throw Error('Invalid backup envelope');
  const header=Buffer.alloc(magic.length+12),tag=Buffer.alloc(16);
  await handle.read(header,0,header.length,0);await handle.read(tag,0,16,size-16);
  if(!header.subarray(0,magic.length).equals(magic))throw Error('Invalid backup envelope');
  const decipher=crypto.createDecipheriv('aes-256-gcm',key,header.subarray(magic.length));decipher.setAAD(magic);decipher.setAuthTag(tag);
  await writeFile(target,'',{flag:'wx',mode:0o600});created=true;
  await pipeline(createReadStream(file,{start:header.length,end:size-17}),decipher,createGunzip(),createWriteStream(target,{flags:'a',mode:0o600}));
 }catch(error){if(created)await unlink(target).catch(()=>{});throw error;}finally{await handle.close();}
}
