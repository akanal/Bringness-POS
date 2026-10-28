import pg from 'pg';
import {configuredIdriveDocumentStore} from '../server/idrive-document-store.js';
import {migrateLegacyMedia} from '../server/idrive-legacy-media.js';
const args=process.argv.slice(2);
if(args.some(x=>!['--apply','--readers-deployed'].includes(x))||args.includes('--apply')&&!args.includes('--readers-deployed'))throw Error('Apply requires --readers-deployed after verified deployment of PR172');
if(!process.env.DATABASE_URL)throw Error('DATABASE_URL_REQUIRED');
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,max:2});let store;
try{
 const apply=args.includes('--apply');
 if(apply)store=await configuredIdriveDocumentStore(process.env,{maxBytes:25*1024*1024});
 console.log(JSON.stringify(await migrateLegacyMedia(pool,store,{apply})));
}catch{console.error('MEDIA_MIGRATION_FAILED: local row retained on failure; inspect protected operator diagnostics.');process.exitCode=1;}
finally{store?.close();await pool.end();}
