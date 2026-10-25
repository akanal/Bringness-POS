import {uuid} from './shop-drafts.js';
import {shopActor,sessionHash,shopError} from './shop-account.js';
import {lockShopOrder} from './shop-checkout-dispatch.js';
import {matchesShopPayment} from './shop-provider-proof.js';

// Explicitly invoked local TEST rehearsal only. No routes, timers, production
// entitlements, invoice numbers, customer email or provider writes.
export async function migrateShopTestFulfilment(db){
 await db.query(`CREATE TABLE IF NOT EXISTS shop_test_fulfilments(
  checkout_id uuid PRIMARY KEY REFERENCES shop_checkout_orders(id),
  company_id uuid NOT NULL REFERENCES companies(id),
  provider_payment_id text NOT NULL UNIQUE,
  document jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
 )`);
}

function validateSnapshot(order){
 const s=order.snapshot;
 if(!s||s.productId!=='pos-download'||s.planCode!=='download_license'||s.period!=='once')throw shopError('FULFILMENT_UNSUPPORTED');
 if(s.currency!=='EUR'||![s.netCents,s.vatCents,s.grossCents].every(n=>Number.isSafeInteger(n)&&n>=0&&n<=2147483647)||s.netCents<=0||s.netCents+s.vatCents!==s.grossCents||Number((BigInt(s.netCents)*19n+50n)/100n)!==s.vatCents)throw shopError('FULFILMENT_MISMATCH');
 const b=order.billing_snapshot;
 if(!b||['company_name','street','postal_code','city','country'].some(k=>typeof b[k]!=='string'||!b[k].trim()||b[k].length>500))throw shopError('FULFILMENT_MISMATCH');
 return {version:1,mode:'test',kind:'fulfilment_preview',label:'TEST – keine Rechnung, keine gültige Lizenz',checkoutId:order.id,companyId:order.company_id,productId:s.productId,planCode:s.planCode,period:s.period,currency:s.currency,netCents:s.netCents,vatCents:s.vatCents,grossCents:s.grossCents,buyer:{company_name:b.company_name,street:b.street,postal_code:b.postal_code,city:b.city,country:b.country},canPay:false,canActivate:false,invoiceIssued:false};
}

export async function rehearseShopTestFulfilment(pool,{id,fetchPayment}){
 if(!uuid(id)||typeof fetchPayment!=='function')throw shopError('INVALID_REQUEST');
 const reference=(await pool.query('SELECT provider_payment_id FROM shop_checkout_orders WHERE id=$1',[id])).rows[0];
 if(!reference?.provider_payment_id)throw shopError('CHECKOUT_NOT_FOUND');
 let payment;try{payment=await fetchPayment(reference.provider_payment_id);}catch{throw shopError('PROVIDER_UNCERTAIN');}
 const db=await pool.connect();try{
  await db.query('BEGIN');await db.query("SET LOCAL statement_timeout='5s'");
  const order=await lockShopOrder(db,id);
  if(!matchesShopPayment(order,payment)||payment.status!=='paid')throw shopError('PROVIDER_MISMATCH');
  if(order.status!=='paid'||order.provider_status!=='paid')throw shopError('CHECKOUT_PENDING');
  const document=validateSnapshot(order);
  const job=(await db.query('SELECT * FROM shop_license_jobs WHERE checkout_id=$1 FOR UPDATE',[id])).rows[0];
  if(!job||job.status!=='pending'||job.company_id!==order.company_id||job.plan_code!==order.snapshot.planCode||job.provider_payment_id!==order.provider_payment_id)throw shopError('FULFILMENT_MISMATCH');
  const guard=(await db.query('SELECT * FROM billing_checkout_guards WHERE company_id=$1 AND id=$2 FOR UPDATE',[order.company_id,order.guard_id])).rows[0];
  if(!guard||guard.status!=='open'||guard.slot!=='base'||guard.provider_payment_id!==order.provider_payment_id)throw shopError('CHECKOUT_PENDING');
  const draft=(await db.query('SELECT * FROM shop_order_drafts WHERE company_id=$1 AND id=$2 FOR UPDATE',[order.company_id,order.draft_id])).rows[0];
  if(!draft||draft.status!=='draft')throw shopError('DRAFT_INELIGIBLE');
  const line=draft.snapshot?.lines?.[0];
  if(draft.snapshot?.lines?.length!==1||line.quantity!==1||['productId','planCode','period','netCents','vatCents','grossCents'].some(k=>line[k]!==order.snapshot[k]))throw shopError('FULFILMENT_MISMATCH');
  const prior=(await db.query('SELECT * FROM shop_test_fulfilments WHERE checkout_id=$1 FOR UPDATE',[id])).rows[0];
  if(prior){
   if(prior.company_id!==order.company_id||prior.provider_payment_id!==order.provider_payment_id||!sameDocument(prior.document,document))throw shopError('FULFILMENT_MISMATCH');
   await db.query('COMMIT');return {...prior.document,replay:true};
  }
  await db.query('INSERT INTO shop_test_fulfilments(checkout_id,company_id,provider_payment_id,document) VALUES($1,$2,$3,$4)',[id,order.company_id,order.provider_payment_id,JSON.stringify(document)]);
  await db.query('COMMIT');return {...document,replay:false};
 }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
}

function sameDocument(a,b){
 if(!a||!b||typeof a!=='object'||typeof b!=='object')return a===b;
 const keys=Object.keys(a);return keys.length===Object.keys(b).length&&keys.every(k=>Object.hasOwn(b,k)&&sameDocument(a[k],b[k]));
}

export async function readShopTestFulfilment(pool,{token,id}){
 if(!uuid(id))throw shopError('INVALID_REQUEST');const hash=sessionHash(token),db=await pool.connect();try{
  await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await db.query("SET LOCAL statement_timeout='5s'");
  const actor=await shopActor(db,hash);
  const record=(await db.query('SELECT document FROM shop_test_fulfilments WHERE checkout_id=$1 AND company_id=$2',[id,actor.company_id])).rows[0];
  if(!record)throw shopError('CHECKOUT_NOT_FOUND');
  await db.query('COMMIT');return record.document;
 }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
}
