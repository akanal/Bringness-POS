import {planFeature} from '../module-catalog.js';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {Readable} from 'node:stream';
import pg from 'pg';
import {PGlite} from '@electric-sql/pglite';
import {billingWebhookId} from '../billing-webhook-input.js';
import {billingPaymentMatches} from '../billing-payment-validation.js';
import {recurringBillingSource} from '../billing-recurring.js';
import {recordBillingMail,migrateBillingMail} from '../billing-mail.js';
const connectionString=process.env.BILLING_TEST_DATABASE_URL,schema='billing_'+crypto.randomBytes(8).toString('hex');let admin,db,engine;
if(connectionString){const u=new URL(connectionString);assert(['localhost','127.0.0.1'].includes(u.hostname)&&u.pathname==='/bringness_device_test');admin=new pg.Pool({connectionString});await admin.query('CREATE SCHEMA '+schema);db=new pg.Pool({connectionString,options:'-c search_path='+schema+' -c statement_timeout=10000'});engine='PostgreSQL 16';}
else{const embedded=new PGlite();await embedded.waitReady;const query=async(sql,args)=>{if(!args&&sql.includes(';')){await embedded.exec(sql);return {rows:[]};}const r=await embedded.query(sql,args);return {...r,rowCount:r.affectedRows||r.rows.length};};db={query,connect:async()=>({query,release(){}}),end:()=>embedded.close()};engine='embedded PostgreSQL';}
try{
 await db.query(`CREATE TABLE billing_plans(id uuid PRIMARY KEY,code text,name text,billing_type text);CREATE SEQUENCE invoice_number_seq;
 CREATE TABLE billing_transactions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid,plan_id uuid,provider_payment_id text UNIQUE,status text,amount_cents integer,currency text,net_cents integer,vat_cents integer,vat_rate numeric,mollie_customer_id text,mollie_subscription_id text,paid_at timestamptz,invoice_date date,invoice_number text,billing_snapshot jsonb,created_at timestamptz DEFAULT now());
 CREATE TABLE company_billing_profiles(company_id uuid,company_name text,contact_name text,street text,postal_code text,city text,country text,vat_id text);
 CREATE TABLE company_entitlements(company_id uuid,plan_id uuid,status text,provider text,provider_customer_id text,provider_reference text,purchased_at timestamptz,current_period_end timestamptz);
 CREATE TABLE company_features(company_id uuid,feature_code text,status text,starts_at timestamptz,ends_at timestamptz,grace_until timestamptz,payment_status text,UNIQUE(company_id,feature_code));`);
 await migrateBillingMail(db);
 const company=crypto.randomUUID(),plan=crypto.randomUUID(),txid=crypto.randomUUID();await db.query("INSERT INTO billing_plans VALUES($1,'pos_base_monthly','Fixture POS','monthly')",[plan]);
 await db.query("INSERT INTO billing_transactions(id,company_id,plan_id,provider_payment_id,status,amount_cents,currency,net_cents,vat_cents,vat_rate,mollie_customer_id,mollie_subscription_id) VALUES($1,$2,$3,'tr_first','open',3569,'EUR',2999,570,19,'cst_fixture','sub_fixture')",[txid,company,plan]);
 const route=(await readFile(new URL('../index.js',import.meta.url),'utf8')).split('\n').find(line=>line.startsWith('if(p==="/api/v1/mollie/webhook"'));
 const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor,run=new AsyncFunction('p','req','res','json','pool','billingWebhookId','billingPaymentMatches','recurringBillingSource','mollieFetch','recordBillingMail','planFeature',route);
 let payment={id:'tr_first',status:'paid',customerId:'cst_fixture',subscriptionId:'sub_fixture',amount:{currency:'EUR',value:'35.69'}};
 const keys=[];const call=async(provider,{mail=recordBillingMail,subscriptionId='sub_provisioned'}={})=>{const req=Readable.from(['id='+provider.id]);Object.assign(req,{method:'POST',headers:{host:'fixture.example.test'}});let response;
 await run('/api/v1/mollie/webhook',req,{},(_,status,data)=>response={status,data},db,billingWebhookId,billingPaymentMatches,recurringBillingSource,async(url,options)=>{if(url.endsWith('/subscriptions')){keys.push(options.headers['Idempotency-Key']);return {ok:true,status:200,json:async()=>({id:subscriptionId})};}return {ok:true,json:async()=>structuredClone(provider)};},mail,planFeature);return response;};
 for(const patch of [{amount:{currency:'EUR',value:'35.6901'}},{amount:{currency:'USD',value:'35.69'}},{amount:{currency:'EUR',value:'1.00'}},{customerId:'cst_other'},{status:'invented'},{amountRefunded:{currency:'EUR',value:'0.01'}}]){assert.equal((await call({...payment,...patch})).status,409);assert.equal((await db.query('SELECT count(*)::int n FROM company_entitlements')).rows[0].n,0);}
 await assert.rejects(call(payment,{mail:async()=>{throw Error('Synthetic audit/mail failure');}}));assert.equal((await db.query('SELECT paid_at FROM billing_transactions WHERE id=$1',[txid])).rows[0].paid_at,null);assert.equal((await db.query('SELECT count(*)::int n FROM company_entitlements')).rows[0].n,0);
 assert.equal((await call(payment)).status,200);const first=(await db.query('SELECT * FROM billing_transactions WHERE id=$1',[txid])).rows[0];assert(first.invoice_number);assert.equal((await call(payment)).status,200);assert.equal((await call({...payment,status:'failed'})).status,409);
 assert.equal((await db.query('SELECT count(*)::int n FROM company_entitlements')).rows[0].n,1);assert.equal((await db.query('SELECT count(*)::int n FROM billing_mail_events')).rows[0].n,1);
 const recurring={...payment,id:'tr_recurring',metadata:{companyId:company,planCode:'pos_base_monthly'}};
 if(connectionString)assert((await Promise.all(Array.from({length:5},()=>call(recurring)))).every(r=>r.status===200));else{assert.equal((await call(recurring)).status,200);assert.equal((await call(recurring)).status,200);}
 assert.equal((await db.query("SELECT count(*)::int n FROM billing_transactions WHERE provider_payment_id='tr_recurring'")).rows[0].n,1);assert.equal((await db.query('SELECT count(*)::int n FROM company_entitlements')).rows[0].n,2);assert.equal((await db.query('SELECT count(*)::int n FROM billing_mail_events')).rows[0].n,2);
 assert.equal((await db.query("SELECT amount_cents FROM billing_transactions WHERE provider_payment_id='tr_recurring'")).rows[0].amount_cents,3569);
 const foreign={...recurring,id:'tr_foreign',metadata:{...recurring.metadata,companyId:crypto.randomUUID()}};assert.equal((await call(foreign)).status,200);assert.equal((await db.query("SELECT count(*)::int n FROM billing_transactions WHERE provider_payment_id='tr_foreign'")).rows[0].n,0);
 const setupId=crypto.randomUUID();await db.query("INSERT INTO billing_transactions(id,company_id,plan_id,provider_payment_id,status,amount_cents,currency,net_cents,vat_cents,vat_rate,mollie_customer_id) VALUES($1,$2,$3,'tr_setup','open',3569,'EUR',2999,570,19,'cst_fixture')",[setupId,company,plan]);
 const setup={...payment,id:'tr_setup',subscriptionId:undefined};assert.equal((await call(setup,{subscriptionId:'tr_wrong_resource'})).status,502);assert.equal((await db.query('SELECT paid_at FROM billing_transactions WHERE id=$1',[setupId])).rows[0].paid_at,null);
 await assert.rejects(call(setup,{mail:async()=>{throw Error('Synthetic post-provider failure');}}));assert.equal((await call(setup)).status,200);assert.equal(new Set(keys).size,1);assert.equal(keys[0],setupId+':subscription-v2');assert.equal((await db.query('SELECT mollie_subscription_id FROM billing_transactions WHERE id=$1',[setupId])).rows[0].mollie_subscription_id,'sub_provisioned');
 console.log(engine+' billing webhook passed: exact payment binding, rollback, immutable paid status, one invoice/access/mail event per payment, existing contract price and '+(connectionString?'five simultaneous recurring observations':'sequential recurring replay')+'. No real provider requests.');
}finally{await db.end();if(admin){await admin.query('DROP SCHEMA '+schema+' CASCADE');await admin.end();}}
