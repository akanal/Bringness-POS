import {readFile} from 'node:fs/promises';
import {billingQuote} from '../billing-quote.js';
import {moduleCatalog,moduleBookingError} from '../module-catalog.js';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import pg from 'pg';
import {PGlite} from '@electric-sql/pglite';
import {migrateCheckoutGuard,reserveCheckout,resolveCheckout} from '../billing-checkout-guard.js';
const postgresUrl=process.env.BILLING_TEST_DATABASE_URL;
let db,adminDb,schema;
if(postgresUrl){const u=new URL(postgresUrl);assert(['127.0.0.1','localhost'].includes(u.hostname)&&u.pathname==='/bringness_device_test');schema='billing_guard_'+crypto.randomBytes(8).toString('hex');adminDb=new pg.Pool({connectionString:postgresUrl});await adminDb.query('CREATE SCHEMA '+schema);db=new pg.Pool({connectionString:postgresUrl,options:'-c search_path='+schema});db.exec=s=>db.query(s);db.close=()=>db.end();}else{db=new PGlite();await db.waitReady;}
const query=async(sql,args)=>{if(!args&&sql.includes(';')){await db.exec(sql);return {rows:[],rowCount:0}}const r=await db.query(sql,args);return {...r,rowCount:r.rowCount??r.affectedRows??r.rows.length}};
const pool={query,connect:async()=>postgresUrl?db.connect():({query,release(){}})};
try{
 await db.exec(`CREATE TABLE companies(id uuid PRIMARY KEY);CREATE TABLE billing_plans(id uuid PRIMARY KEY,code text,name text DEFAULT 'Fixture',billing_type text DEFAULT 'monthly',amount_cents int DEFAULT 999,currency text DEFAULT 'EUR',active boolean DEFAULT true);CREATE TABLE company_billing_profiles(company_id uuid,company_name text,street text,postal_code text,city text,country text);CREATE TABLE company_billing_terms(company_id uuid,plan_code text,monthly_net_cents int);CREATE TABLE company_entitlements(company_id uuid,plan_id uuid,status text,current_period_end timestamptz);CREATE TABLE company_features(company_id uuid,feature_code text,status text,ends_at timestamptz,grace_until timestamptz);CREATE TABLE billing_transactions(company_id uuid,plan_id uuid,status text,paid_at timestamptz,provider_payment_id text,amount_cents int,currency text,checkout_url text,net_cents int,vat_cents int,vat_rate int,mollie_customer_id text,billing_snapshot jsonb);CREATE TABLE approvals(id text PRIMARY KEY,consumed boolean DEFAULT false);`);
 await migrateCheckoutGuard(pool);await migrateCheckoutGuard(pool);
 const user={company_id:crypto.randomUUID()},other={company_id:crypto.randomUUID()},plan={id:crypto.randomUUID(),code:'ean_scanner_monthly'},base={id:crypto.randomUUID(),code:'pos_base_monthly'},download={id:crypto.randomUUID(),code:'download_license'};
 for(const u of [user,other])await query('INSERT INTO companies VALUES($1)',[u.company_id]);for(const p of [plan,base,download])await query('INSERT INTO billing_plans(id,code) VALUES($1,$2)',[p.id,p.code]);
 const yes=async()=>true;
 assert.equal((await reserveCheckout(pool,user,plan,async()=>false)).code,'APPROVAL_REQUIRED');
 await query("INSERT INTO approvals(id) VALUES('once')");
 const approve=async c=>Boolean((await c.query("UPDATE approvals SET consumed=true WHERE id='once' AND consumed=false RETURNING id")).rowCount);
 await assert.rejects(reserveCheckout(pool,user,plan,async c=>{await c.query("UPDATE approvals SET consumed=true WHERE id='once'");throw Error('fixture rollback')}));assert.equal((await query("SELECT consumed FROM approvals WHERE id='once'")).rows[0].consumed,false);
 const first=await reserveCheckout(pool,user,plan,approve);assert(first.id);await assert.rejects(query("INSERT INTO billing_checkout_guards(id,company_id,plan_id,slot,status) VALUES($1,$2,$3,$4,'open')",[crypto.randomUUID(),user.company_id,plan.id,plan.code]),e=>e.code==='23505');assert.equal((await reserveCheckout(pool,user,plan,yes)).code,'CHECKOUT_PENDING');
 // A handler restart/unknown provider result does not age the claim out.
 await query("UPDATE billing_checkout_guards SET created_at=now()-interval '2 days' WHERE id=$1",[first.id]);assert.equal((await reserveCheckout(pool,user,plan,yes)).code,'CHECKOUT_PENDING');
 await query("UPDATE billing_checkout_guards SET provider_payment_id='tr_fixture',status='open' WHERE id=$1",[first.id]);
 await resolveCheckout(pool,'tr_fixture','open');assert.equal((await reserveCheckout(pool,user,plan,yes)).code,'CHECKOUT_PENDING');
 await query("INSERT INTO company_entitlements VALUES($1,$2,'canceled',now()+interval '1 day')",[user.company_id,plan.id]);await resolveCheckout(pool,'tr_fixture','paid');assert.equal((await reserveCheckout(pool,user,plan,yes)).code,'ALREADY_ACTIVE');
 await query("UPDATE company_entitlements SET current_period_end=now()-interval '1 second'");assert((await reserveCheckout(pool,user,plan,yes)).id);
 assert((await reserveCheckout(pool,other,plan,yes)).id,'tenant isolated');
 const b=await reserveCheckout(pool,user,base,yes);assert(b.id);assert.equal((await reserveCheckout(pool,user,download,yes)).code,'CHECKOUT_PENDING','one base across different plans');
 await query("UPDATE billing_checkout_guards SET status='resolved'");
 await query("UPDATE company_entitlements SET status='active'");assert.equal((await reserveCheckout(pool,user,plan,yes)).code,'ALREADY_ACTIVE','overdue recurring contract must not create another subscription');await query("UPDATE company_entitlements SET status='canceled'");
 await query("INSERT INTO billing_transactions(company_id,plan_id,status,paid_at) VALUES($1,$2,'pending',NULL)",[user.company_id,plan.id]);assert.equal((await reserveCheckout(pool,user,plan,yes)).code,'CHECKOUT_PENDING','old unresolved checkout retained');await query('DELETE FROM billing_transactions');
 await query("INSERT INTO company_features VALUES($1,'ean_scanner','active',now()-interval '1 day',now()+interval '1 day')",[user.company_id]);assert.equal((await reserveCheckout(pool,user,plan,yes)).code,'ALREADY_ACTIVE','grace period not rebilled');await query('DELETE FROM company_features');
 if(postgresUrl){const results=await Promise.all(Array.from({length:8},()=>reserveCheckout(pool,user,plan,yes)));assert.equal(results.filter(r=>r.id).length,1);assert.equal(results.filter(r=>r.code==='CHECKOUT_PENDING').length,7);}

 await query("UPDATE billing_checkout_guards SET status='resolved'");
 await query("INSERT INTO company_billing_profiles VALUES($1,'Fixture','Street 1','10115','Berlin','Deutschland')",[other.company_id]);
 const source=(await readFile(new URL('../index.js',import.meta.url),'utf8')).split('\n').find(l=>l.startsWith('if(p==="/api/v1/billing/checkout"'));
 const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
 const route=new AsyncFunction('p','req','res','auth','body','pool','json','hasRawFeature','hasFeature','process','moduleCatalog','moduleBookingError','billingQuote','consumeModuleApproval','reserveCheckout','mollieFetch',source);
 let charges=0;const provider=async(url,options)=>{assert(options.headers['Idempotency-Key']);return {ok:true,json:async()=>url.endsWith('/customers')?{id:'cst_fixture'}:(charges++,{id:'tr_route',status:'open',_links:{checkout:{href:'https://checkout.example.test/fixture'}}})}};
 const call=async()=>{let result;await route('/api/v1/billing/checkout',{method:'POST',headers:{}},{},async()=>({...other,role:'owner',display_name:'Fixture',email:'fixture@example.test'}),async()=>({planCode:plan.code,expectedNetCents:999}),pool,(_,status,data)=>result={status,data},async()=>false,async()=>true,{env:{MOLLIE_API_KEY:'fixture-not-real',PUBLIC_URL:'https://fixture.example.test'}},moduleCatalog,moduleBookingError,billingQuote,async()=>true,reserveCheckout,provider);return result;};
 const replies=postgresUrl?await Promise.all(Array.from({length:8},call)):[await call(),await call()];assert.equal(replies.filter(r=>r.status===201).length,1);assert.equal(replies.filter(r=>r.status===409).length,replies.length-1);assert.equal(charges,1);assert.equal((await query("SELECT count(*)::int n FROM billing_transactions WHERE provider_payment_id='tr_route'")).rows[0].n,1);
 console.log('Billing guards passed: one-time approval, restart/ambiguous timeout, pending legacy payment, canceled paid period, grace, tenant isolation, base-plan race'+(postgresUrl?', eight real simultaneous PostgreSQL requests yield one claim':'')+'. No external charges.');
}finally{await db.close();if(adminDb){await adminDb.query('DROP SCHEMA '+schema+' CASCADE');await adminDb.end();}}
