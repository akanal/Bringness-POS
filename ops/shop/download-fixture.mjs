import crypto from 'node:crypto';
import {fixture} from './fixture.mjs';
import {payment} from './provider-fixture.mjs';
import {migrateShopDrafts,saveShopDraft} from '../../server/shop-drafts.js';
import {migrateShopCheckouts,prepareShopCheckout} from '../../server/shop-checkout-orders.js';
import {dispatchPreparedShopCheckout} from '../../server/shop-checkout-dispatch.js';
import {migrateShopPaymentStatus,reconcileShopTestPayment} from '../../server/shop-payment-status.js';
import {migrateShopDownloadFulfilment,fulfilShopLiveDownload} from '../../server/shop-download-fulfilment.js';
import {readShopDownloadInvoiceConsent,recordShopDownloadInvoiceConsent} from '../../server/shop-download-consent.js';
export const seller={name:'Synthetic seller',street:'Example 2',postalCode:'10115',city:'Berlin',taxId:'SYNTHETIC-ONLY',country:'DE'};
export async function downloadFixture({accept=true,paid=true}={}){
 const f=await fixture(),{pool,db}=f;
 await db.exec(`ALTER TABLE company_entitlements ADD COLUMN id uuid PRIMARY KEY,ADD COLUMN provider text,ADD COLUMN provider_reference text,ADD COLUMN purchased_at timestamptz;
 ALTER TABLE billing_transactions ADD COLUMN id uuid PRIMARY KEY,ADD COLUMN provider text,ADD COLUMN provider_payment_id text UNIQUE,ADD COLUMN amount_cents int,ADD COLUMN currency text,ADD COLUMN invoice_number text UNIQUE,ADD COLUMN invoice_date date,ADD COLUMN net_cents int,ADD COLUMN vat_cents int,ADD COLUMN vat_rate numeric(5,2),ADD COLUMN billing_snapshot jsonb;
 CREATE SEQUENCE invoice_number_seq START 1000;`);
 await migrateShopDrafts(pool);await migrateShopCheckouts(pool);await migrateShopPaymentStatus(pool);await migrateShopDownloadFulfilment(pool);
 const draft=await saveShopDraft(pool,{token:'owner-a',requestId:crypto.randomUUID(),cart:{'pos-download':1}}),line=draft.snapshot.lines[0];
 const order=await prepareShopCheckout(pool,{token:'owner-a',draftId:draft.id,requestId:crypto.randomUUID(),acceptedNetCents:line.netCents,acceptedGrossCents:line.grossCents});
 const readConsent=(extra={})=>readShopDownloadInvoiceConsent(pool,{id:order.id,token:'owner-a',seller,...extra}),view=await readConsent();
 const consent=(extra={})=>recordShopDownloadInvoiceConsent(pool,{id:order.id,token:'owner-a',seller,accepted:true,acceptedDigest:view.digest,...extra});
 if(accept)await consent();
 const state={...f,order,draft,view,readConsent,consent};
 state.progress=async()=>{
  let command;await dispatchPreparedShopCheckout(pool,{id:order.id,submit:async c=>{command=c;return payment(c);}});
  await reconcileShopTestPayment(pool,{id:order.id,fetchPayment:async()=>payment(command,'paid')});
  // Disposable fixture only; no network calls or real LIVE acceptance.
  state.proof={...payment(command,'paid'),mode:'live',paidAt:new Date().toISOString()};
 };
 state.run=(extra={})=>fulfilShopLiveDownload(pool,{id:order.id,enabled:true,fetchPayment:async()=>state.proof,...extra});
 if(paid&&!accept){
  // Seed an intentionally invalid historical paid row to test legacy protection.
  // This never calls dispatch or bypasses its required-consent check.
  const command={...order.snapshot,orderId:order.id,companyId:f.a},proof=payment(command,'paid');
  await db.query("UPDATE shop_checkout_orders SET status='paid',provider_status='paid',provider_mode='test',provider_payment_id=$1,dispatch_started_at=clock_timestamp() WHERE id=$2",[proof.id,order.id]);
  await db.query("UPDATE billing_checkout_guards SET status='open',provider_payment_id=$1",[proof.id]);
  await db.query('INSERT INTO shop_license_jobs(checkout_id,company_id,plan_code,provider_payment_id) VALUES($1,$2,$3,$4)',[order.id,f.a,'download_license',proof.id]);
  state.proof={...proof,mode:'live',paidAt:new Date().toISOString()};
 }else if(paid)await state.progress();return state;
}
