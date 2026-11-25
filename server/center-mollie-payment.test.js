import test from 'node:test';
import assert from 'node:assert/strict';
import {eurCents,normalizeMolliePayment,verifyAndReleaseMolliePayment} from './center-mollie-payment.js';
const credential={profile_id:'pfl_restaurant',organization_id:'org_restaurant',verified_at:'now'};
const payment={id:'tr_123',profileId:'pfl_restaurant',amount:{value:'12.50',currency:'EUR'},status:'paid',paidAt:'2026-10-06T12:00:00Z',metadata:{bringnessOrderId:'order'}};
test('verified merchant payment is normalized using exact cents',()=>{const p=normalizeMolliePayment(payment,credential);assert.equal(p.amountCents,1250);assert.equal(p.merchantReference,'org_restaurant');assert.equal(p.orderId,'order');});
test('other profile and unverified credentials are rejected',()=>{assert.throws(()=>normalizeMolliePayment({...payment,profileId:'pfl_other'},credential));assert.throws(()=>normalizeMolliePayment(payment,{...credential,verified_at:null}));});
test('malformed or non-EUR amount fails closed',()=>{for(const a of [{value:'12.5',currency:'EUR'},{value:'-1.00',currency:'EUR'},{value:'12.50',currency:'USD'}])assert.throws(()=>eurCents(a));});
test('refund and chargeback are retained for release validation',()=>{const p=normalizeMolliePayment({...payment,amountRefunded:{value:'1.00',currency:'EUR'},amountChargedBack:{value:'0.50',currency:'EUR'}},credential);assert.equal(p.refundedCents,100);assert.equal(p.chargedBackCents,50);});
test('unknown payment never accesses merchant API',async()=>assert.equal((await verifyAndReleaseMolliePayment({query:async()=>({rows:[]})},'tr_unknown',{},()=>{throw Error('no provider access')})).reason,'unknown_payment'));

test('refund overview uses the original payment mode and refuses unrelated payment data',async()=>{
 const {readCenterRefundOverview}=await import('./center-mollie-payment.js');
 const {encryptMerchantTokens}=await import('./center-mollie-connect.js');
 const env={CENTER_MOLLIE_TOKEN_KEY:'b'.repeat(64)};
 const binding={payment_id:payment.id,restaurant_id:'restaurant',merchant_reference:'org_restaurant',amount_cents:1250,request_payload:{testmode:true}};
 const envelope=encryptMerchantTokens({access_token:'fixture'},binding.restaurant_id,env);
 const pool={
  query:async(sql,args)=>{
   if(sql.includes('FROM center_mollie_credentials'))return {rows:[credential]};
   assert.match(sql,/r.company_id=\$2/);
   return {rows:args[1]==='company'?[binding]:[]};
  },
  connect:async()=>({
   query:async()=>({rows:[{token_envelope:envelope,expires_at:new Date(Date.now()+3600000)}]}),
   release(){}
  })
 };
 let requests=0;
 const provider=async(url,options)=>{
  requests++;
  assert.equal(url,'https://api.mollie.com/v2/payments/tr_123?testmode=true');
  assert.equal(options.method,undefined);
  assert.equal(options.redirect,'error');
  return {ok:true,json:async()=>({...payment,amountRefunded:{value:'1.00',currency:'EUR'}})};
 };
 assert.equal(await readCenterRefundOverview(pool,'other','order',env,provider),null);
 assert.equal(requests,0);
 assert.deepEqual(await readCenterRefundOverview(pool,'company','order',env,provider),
  {orderId:'order',mode:'test',paidCents:1250,refundedCents:100,chargedBackCents:0,currency:'EUR'});
 await assert.rejects(readCenterRefundOverview(pool,'company','other-order',env,provider),/PAYMENT_BINDING_MISMATCH/);
});
