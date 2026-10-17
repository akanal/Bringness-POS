import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {spawn,spawnSync} from 'node:child_process';
import {createReadStream} from 'node:fs';
import {mkdtemp,readFile,lstat,rm,open} from 'node:fs/promises';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import os from 'node:os';
import path from 'node:path';
import {createBackupKey,encryptBackup,decryptBackup} from './preview-backup-crypto.mjs';
let phase='arguments';
const composeFile='ops/isolated-preview.compose.json';
const databases=['bringness_ai_preview','bringness_languages','bringness_preview','postgres'];
const envKeys=['AI_DB_PASSWORD','PASSWORD_PEPPER','PREVIEW_ACCESS_PASSWORD','PREVIEW_DATABASE_PASSWORD','PREVIEW_OWNER_PASSWORD','PREVIEW_SESSION_SECRET'];
function command(args,{input,stage='Docker operation',maxBuffer=8*1024*1024}={}){
 const result=spawnSync('docker',args,{encoding:'utf8',input,maxBuffer,timeout:120000});
 if(result.status!==0||result.error)throw Error(stage+' failed; sensitive output withheld');return result.stdout.trim();
}
function psql(container,user,database,sql){return command(['exec','-i',container,'psql','-X','-q','-t','-A','-v','ON_ERROR_STOP=1','-U',user,'-d',database],{input:sql,stage:'Database verification'});}
function environment(text){
 const entries=text.trim().split('\n').map(line=>{const at=line.indexOf('=');return [line.slice(0,at),line.slice(at+1)];});
 if(entries.length!==6||entries.some(([k,v])=>!envKeys.includes(k)||!v||v.length<32)||new Set(entries.map(([k])=>k)).size!==6)throw Error('Invalid dedicated preview configuration');
 return Object.fromEntries(entries);
}
const tableSql=`CREATE TEMP TABLE preview_restore_check(table_name text,rows bigint,digest text);
DO $$ DECLARE t record; BEGIN FOR t IN SELECT table_schema,table_name FROM information_schema.tables WHERE table_type='BASE TABLE' AND table_schema='public' ORDER BY table_name LOOP
EXECUTE format('INSERT INTO preview_restore_check SELECT %L,count(*),md5(COALESCE(string_agg(to_jsonb(r)::text,chr(10) ORDER BY to_jsonb(r)::text),%L)) FROM %I.%I r',t.table_name,'',t.table_schema,t.table_name);
END LOOP; END $$;
SELECT COALESCE(json_agg(preview_restore_check ORDER BY table_name),'[]'::json) FROM preview_restore_check;`;
function snapshot(container,user){
 const names=JSON.parse(psql(container,user,'postgres',"SELECT json_agg(datname ORDER BY datname) FROM pg_database WHERE NOT datistemplate;"));assert.deepEqual(names,databases);
 const result={};for(const name of names)result[name]={tables:JSON.parse(psql(container,user,name,tableSql)),sequences:JSON.parse(psql(container,user,name,"SELECT COALESCE(json_agg(s ORDER BY sequencename),'[]'::json) FROM (SELECT schemaname,sequencename,sequenceowner,data_type,start_value,min_value,max_value,increment_by,cycle,cache_size,last_value FROM pg_sequences WHERE schemaname='public') s;"))};
 result.roles=psql(container,user,'postgres',"SELECT md5(string_agg(row_to_json(r)::text,chr(10) ORDER BY rolname)) FROM (SELECT rolname,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolcanlogin,rolreplication,rolconnlimit,rolpassword,rolvaliduntil,rolbypassrls,(SELECT setconfig FROM pg_db_role_setting WHERE setrole=pg_authid.oid AND setdatabase=0) AS rolconfig FROM pg_authid WHERE rolname NOT LIKE 'pg_%' AND rolname <> 'bringness_restore_verifier') r;");
 return result;
}
function child(args){
 const process=spawn('docker',args,{stdio:['pipe','pipe','pipe']});process.stderr.resume();
 const completion=new Promise(resolve=>{process.once('error',()=>resolve(-1));process.once('close',code=>resolve(code));});return {process,completion};
}
async function backup(envFile,file,keyFile){
 phase='backup configuration';const info=await lstat(envFile);if(!info.isFile()||(info.mode&0o077)!==0)throw Error('Preview configuration must be private');
 const config=environment(await readFile(envFile,'utf8'));
 const compose=['compose','--env-file',envFile,'-f',composeFile];
 if(command([...compose,'ps','--status','running','-q','preview-app']))throw Error('Stop the preview application before backup for a consistent cross-database snapshot');
 const container=command([...compose,'ps','-q','preview-db']);if(!/^[a-f0-9]{12,64}$/.test(container))throw Error('Dedicated preview database must be running');
 const inspected=JSON.parse(command(['inspect',container]))[0];
 if(inspected.Config.Labels?.['com.docker.compose.project']!=='bringness-isolated-preview'||inspected.Config.Labels?.['com.docker.compose.service']!=='preview-db')throw Error('Unexpected database container');
 for(const network of Object.keys(inspected.NetworkSettings.Networks))if(!JSON.parse(command(['network','inspect',network]))[0].Internal)throw Error('Preview database network is not isolated');
 phase='source database fingerprints';const metadata={format:'bringness-preview-backup-v1',createdAt:new Date().toISOString(),configuration:config,snapshot:snapshot(container,'preview_admin')};
 phase='encrypted cluster dump';const dump=child(['exec',container,'pg_dumpall','-U','preview_admin']);
 const source=Readable.from((async function*(){yield JSON.stringify(metadata)+'\n';for await(const chunk of dump.process.stdout)yield chunk;if(await dump.completion!==0)throw Error('Database dump failed');})());
 try{await encryptBackup(source,file,keyFile);}finally{if(dump.process.exitCode===null)dump.process.kill();}
 console.log('Private encrypted preview backup created, including independent configuration, database roles and all preview databases.');
}
async function verify(file,keyFile){
 const dir=await mkdtemp(path.join(os.tmpdir(),'bringness-preview-restore-')),plain=path.join(dir,'authenticated.sql');
 const container='bringness-preview-restore-'+crypto.randomBytes(8).toString('hex');let started=false;
 try{
  phase='archive authentication';await decryptBackup(file,plain,keyFile);
  const handle=await open(plain,'r');let bytes;try{const buffer=Buffer.alloc(256*1024);const {bytesRead}=await handle.read(buffer,0,buffer.length,0);bytes=buffer.subarray(0,bytesRead);}finally{await handle.close();}
  phase='archive metadata';const end=bytes.indexOf(10);if(end<0)throw Error('Invalid backup metadata');
  const metadata=JSON.parse(bytes.subarray(0,end).toString('utf8'));if(metadata.format!=='bringness-preview-backup-v1')throw Error('Invalid backup format');
  environment(Object.entries(metadata.configuration).map(([k,v])=>k+'='+v).join('\n'));
  // No source volume, exposed port, external network or application process.
  phase='recovery container startup';started=true;command(['run','-d','--name',container,'--network','none','--read-only','--tmpfs','/var/lib/postgresql/data:rw,nosuid,size=1g','--tmpfs','/var/run/postgresql:rw,nosuid,size=16m','--label','bringness.preview.restore=disposable','-e','POSTGRES_USER=bringness_restore_verifier','-e','POSTGRES_DB=postgres','-e','POSTGRES_HOST_AUTH_METHOD=trust','postgres:16-alpine'],{stage:'Disposable recovery database startup'});
  phase='recovery database readiness';let ready=false;for(let attempt=0;attempt<120;attempt++){
   const check=spawnSync('docker',['exec',container,'pg_isready','-h','127.0.0.1','-U','bringness_restore_verifier','-d','postgres'],{stdio:'ignore',timeout:3000});if(check.status===0){ready=true;break;}await new Promise(resolve=>setTimeout(resolve,500));
  }
  if(!ready)throw Error('Disposable recovery database was not ready');
  phase='cluster SQL restore';const restore=child(['exec','-i',container,'psql','-X','-q','-v','ON_ERROR_STOP=1','-U','bringness_restore_verifier','-d','postgres']);restore.process.stdout.resume();
  await pipeline(createReadStream(plain,{start:end+1}),restore.process.stdin);if(await restore.completion!==0)throw Error('Database restore failed; sensitive output withheld');
  phase='restored database fingerprints';const restored=snapshot(container,'bringness_restore_verifier');
  const differences=[];
  for(const name of databases){
   for(const table of metadata.snapshot[name].tables)if(JSON.stringify(restored[name].tables.find(t=>t.table_name===table.table_name))!==JSON.stringify(table))differences.push(name+':table:'+table.table_name);
   if(JSON.stringify(restored[name].sequences)!==JSON.stringify(metadata.snapshot[name].sequences))differences.push(name+':sequence state');
  }
  if(restored.roles!==metadata.snapshot.roles)differences.push('role attributes or credentials');
  if(differences.length)console.error('Recovery mismatch categories (no row contents): '+differences.join(', '));
  assert.deepEqual(restored,metadata.snapshot,'Restored database rows or roles differ');
  console.log('Recovery verified: all preview database table counts/content fingerprints and role credentials match; original runtime and volume were not modified.');
 }finally{
  try{if(started)command(['rm','-f',container],{stage:'Disposable recovery cleanup'});}finally{await rm(dir,{recursive:true,force:true});}
 }
}
const [operation,...args]=process.argv.slice(2);
try{
 if(operation==='create-key'&&args.length===1){await createBackupKey(args[0]);console.log('Private independent backup key created. Store it separately from backups.');}
 else if(operation==='backup'&&args.length===3)await backup(...args);
 else if(operation==='verify'&&args.length===2)await verify(...args);
 else throw Error('Usage: create-key KEY | backup ENV BACKUP KEY | verify BACKUP KEY');
}catch(error){const code=/^[A-Z0-9_]+$/.test(error.code||'')?error.code:'OPERATION_FAILED';console.error('Preview backup/recovery failed ('+phase+', '+code+'). Check private configuration, arguments, file permissions, stopped application, dedicated database and Docker readiness. Sensitive details withheld.');process.exitCode=1;}
