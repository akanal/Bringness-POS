import assert from 'node:assert/strict';
import {randomUUID as uuid} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {migrateAutoProcurement,saveProcurementPolicy,procurementPolicy} from '../ai-auto-procurement.js';

const db=new PGlite();
try{
 await db.exec(`CREATE TABLE ai_accounts(id uuid PRIMARY KEY,role text,status text,delivery_area text,delivery_terms text,minimum_order_cents bigint);
  CREATE TABLE ai_audit(id bigserial PRIMARY KEY,actor_id uuid,action text,detail jsonb);`);
 const query=async(sql,args)=>{const r=await db.query(sql,args);return {...r,rowCount:r.affectedRows||r.rows.length};};
 const pool={query:async(sql,args)=>args===undefined&&sql.includes(';')?db.exec(sql):query(sql,args),connect:async()=>({query,release(){}})};
 await migrateAutoProcurement(pool);
 const buyer=uuid(),supplier=uuid(),user={id:buyer,role:'restaurant'};
 await query("INSERT INTO ai_accounts VALUES($1,'restaurant','active','','',0),($2,'dealer','active','Berlin','Terms',0)",[buyer,supplier]);
 const policy={enabled:false,days:7,leadDays:2,maxDailyNetCents:10000,supplierIds:[supplier.toUpperCase()]};
 await saveProcurementPolicy(pool,user,policy);
 const read=async()=>(await query('SELECT * FROM ai_auto_procurement WHERE account_id=$1',[buyer])).rows[0];
 assert.equal(await read(),undefined); // First disable must not create a purchasing permission.
 await saveProcurementPolicy(pool,user,{...policy,enabled:true,confirmed:true});
 assert.equal((await read()).policy.supplierIds[0],supplier);
 await saveProcurementPolicy(pool,user,{enabled:false});
 const originalVersion=(await read()).version;
 const brokenAudit={connect:async()=>({query:async(sql,args)=>{if(sql.startsWith('INSERT INTO ai_audit'))throw Error('audit unavailable');return query(sql,args);},release(){}})};
 await assert.rejects(saveProcurementPolicy(brokenAudit,user,{...policy,enabled:true,confirmed:true}),/audit unavailable/);
 assert.equal((await read()).policy.enabled,false);assert.equal((await read()).version,originalVersion);
 await saveProcurementPolicy(pool,user,{...policy,enabled:true,confirmed:true});
 await assert.rejects(saveProcurementPolicy(brokenAudit,user,{enabled:false}),/audit unavailable/);
 assert.equal((await read()).policy.enabled,true);
 await saveProcurementPolicy(pool,user,{enabled:false});
 const disabledVersion=(await read()).version;
 await saveProcurementPolicy(pool,user,{enabled:false});
 assert.equal((await read()).version,disabledVersion);
 assert.equal(Number((await query("SELECT count(*) n FROM ai_audit WHERE action='automatic_procurement_disabled'")).rows[0].n),2);
 await query("UPDATE ai_accounts SET status='suspended' WHERE id=$1",[buyer]);
 await assert.rejects(saveProcurementPolicy(pool,user,{...policy,enabled:true,confirmed:true}),e=>e.status===403);
 assert.equal((await read()).policy.enabled,false);
 assert.throws(()=>procurementPolicy({...policy,supplierIds:[supplier,supplier.toUpperCase()]}),e=>e.status===400);
 assert.throws(()=>procurementPolicy({...policy,supplierIds:[[supplier]]}),e=>e.status===400);
 console.log('Automatic policy passed: atomic consent/audit, rollback, active account checks, canonical suppliers and idempotent disablement.');
}finally{await db.close();}
