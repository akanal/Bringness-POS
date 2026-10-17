import crypto from 'node:crypto';
import {moduleCatalog} from './module-catalog.js';

export async function migrateCheckoutGuard(db){
 await db.query(`CREATE TABLE IF NOT EXISTS billing_checkout_guards(id uuid PRIMARY KEY,company_id uuid NOT NULL REFERENCES companies(id),plan_id uuid NOT NULL REFERENCES billing_plans(id),slot text NOT NULL,status text NOT NULL CHECK(status IN ('creating','open','resolved')),provider_payment_id text UNIQUE,created_at timestamptz NOT NULL DEFAULT now());
 CREATE UNIQUE INDEX IF NOT EXISTS billing_checkout_one_unresolved ON billing_checkout_guards(company_id,slot) WHERE status<>'resolved';`);
}
const base=code=>['pos_base_monthly','download_license','restaurant_monthly'].includes(code);
const conflict=(error,code)=>({error,code});

// The company row is the shared cross-process lock. Commit the claim BEFORE any
// provider request: a timeout/restart must not turn into a second payment.
export async function reserveCheckout(pool,user,plan,approve){
 const c=await pool.connect();
 try{
  await c.query('BEGIN');
  await c.query('SELECT id FROM companies WHERE id=$1 FOR UPDATE',[user.company_id]);
  const slot=base(plan.code)?'base':plan.code;
  const owned=await c.query(`SELECT 1 FROM company_entitlements ce JOIN billing_plans bp ON bp.id=ce.plan_id
   WHERE ce.company_id=$1 AND (bp.id=$2 OR ($3 AND bp.code IN ('pos_base_monthly','download_license','restaurant_monthly')))
   AND (ce.status='active' OR (ce.status='canceled' AND (ce.current_period_end IS NULL OR ce.current_period_end>now()))) LIMIT 1`,[user.company_id,plan.id,base(plan.code)]);
  const feature=moduleCatalog[plan.code]?.feature;
  const granted=feature?await c.query(`SELECT 1 FROM company_features WHERE company_id=$1 AND feature_code=$2 AND status='active' AND (ends_at IS NULL OR ends_at>now() OR grace_until>now())`,[user.company_id,feature]):{rowCount:0};
  if(owned.rowCount||granted.rowCount){await c.query('ROLLBACK');return conflict('Dieses Modul ist bereits aktiv, auch bei Kündigung bis zum Ende des bezahlten Zeitraums.','ALREADY_ACTIVE')}
  const existing=await c.query(`SELECT 1 FROM billing_checkout_guards WHERE company_id=$1 AND slot=$2 AND status<>'resolved'`,[user.company_id,slot]);
  const pending=await c.query(`SELECT 1 FROM billing_transactions bt JOIN billing_plans bp ON bp.id=bt.plan_id WHERE bt.company_id=$1
   AND (bp.id=$2 OR ($3 AND bp.code IN ('pos_base_monthly','download_license','restaurant_monthly')))
   AND (bt.status IN ('open','pending','authorized') OR (bt.status='paid' AND bt.paid_at IS NULL)) LIMIT 1`,[user.company_id,plan.id,base(plan.code)]);
  if(existing.rowCount||pending.rowCount){await c.query('ROLLBACK');return conflict('Für dieses Modul läuft bereits eine Buchung oder Zahlungsprüfung. Es wird keine weitere Zahlung gestartet.','CHECKOUT_PENDING')}
  if(!await approve(c)){await c.query('ROLLBACK');return conflict('Bitte die Modulbuchung über den einmaligen Link in deiner Inhaber-E-Mail bestätigen.','APPROVAL_REQUIRED')}
  const id=crypto.randomUUID();
  await c.query("INSERT INTO billing_checkout_guards(id,company_id,plan_id,slot,status) VALUES($1,$2,$3,$4,'creating')",[id,user.company_id,plan.id,slot]);
  await c.query('COMMIT');return {id};
 }catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}
}

// Only a provider-verified terminal webhook clears the reservation. Never clear
// it on elapsed time, browser navigation, an exception, or an ambiguous timeout.
export async function resolveCheckout(db,paymentId,status){
 if(['paid','failed','expired','canceled'].includes(status))await db.query("UPDATE billing_checkout_guards SET status='resolved' WHERE provider_payment_id=$1",[paymentId]);
}
