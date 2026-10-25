import {test} from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {fixture} from './fixture.mjs';
import {readWindowsEntitlement} from '../../server/windows-entitlement.js';
test('Windows authorization rejects TEST expired and superseded active records and isolates companies',async()=>{
 const f=await fixture();try{
 await f.db.exec('ALTER TABLE company_entitlements ADD COLUMN id uuid PRIMARY KEY,ADD COLUMN purchased_at timestamptz,ADD COLUMN created_at timestamptz DEFAULT clock_timestamp(),ADD COLUMN provider text,ADD COLUMN provider_reference text');
 const add=async(status='active',provider='mollie',end=null,company=f.a)=>{await f.db.query('INSERT INTO company_entitlements(id,company_id,plan_id,status,provider,current_period_end,created_at) VALUES($1,$2,$3,$4,$5,$6,clock_timestamp())',[crypto.randomUUID(),company,f.download,status,provider,end]);};
 assert.equal(await readWindowsEntitlement(f.pool,f.a),null);
 await add();assert.equal((await readWindowsEntitlement(f.pool,f.a)).code,'download_license');assert.equal(await readWindowsEntitlement(f.pool,f.b),null);
 for(const status of ['suspended','pending','expired','canceled','unknown']){await add(status);assert.equal(await readWindowsEntitlement(f.pool,f.a),null);}
 for(const provider of ['test',' TEST ','',null]){await add('active',provider);assert.equal(await readWindowsEntitlement(f.pool,f.a),null);}
 await add('active','mollie','2000-01-01');assert.equal(await readWindowsEntitlement(f.pool,f.a),null);
 await add('active','mollie','2099-01-01');assert.ok(await readWindowsEntitlement(f.pool,f.a));
 await add('active','test',null,f.b);assert.equal(await readWindowsEntitlement(f.pool,f.b),null);
 }finally{await f.db.close();}
});
