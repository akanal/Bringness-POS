import {mollieFetch} from './mollie-request.js';
import {providerEuroCents} from './provider-money.js';
import {uuid} from './shop-drafts.js';
const fail=code=>{throw Error(code);};
const validPayment=id=>/^tr_[A-Za-z0-9]{1,100}$/.test(id||'');
function binding(value){
 if(!value||value.mode!=='live'||value.status!=='verified'||!uuid(value.sellerCompanyId)||!uuid(value.connectionId)||!/^org_[A-Za-z0-9]{1,100}$/.test(value.merchantId||'')||!/^pfl_[A-Za-z0-9]{1,100}$/.test(value.profileId||''))fail('LIVE_READER_BINDING');
 return {sellerCompanyId:value.sellerCompanyId,connectionId:value.connectionId,merchantId:value.merchantId,profileId:value.profileId};
}
// Read-only OAuth integration; no creation/refund POST, environment fallback,
// platform API key, secret persistence or startup/HTTP activation.
export function createMarketplaceLiveReader({loadBinding,withAccessToken,fetcher=globalThis.fetch}={}){
 if(typeof loadBinding!=='function'||typeof withAccessToken!=='function'||typeof fetcher!=='function')fail('LIVE_READER_CONFIG');
 async function read(args,operation){
  if(!args||!uuid(args.sellerCompanyId)||!uuid(args.orderId)||!validPayment(args.providerId))fail('LIVE_READER_INPUT');
  const b=binding(await loadBinding(args.sellerCompanyId));
  if(b.sellerCompanyId!==args.sellerCompanyId||['connectionId','merchantId','profileId'].some(k=>args[k]!==b[k]))fail('LIVE_READER_BINDING');
  let used=false;
  try{
   const value=await withAccessToken(b.sellerCompanyId,b.connectionId,async token=>{
    if(used)fail('LIVE_READER_TOKEN');used=true;
    if(typeof token!=='string'||token.length<10||token.length>4096||/\s/.test(token)||/^(live|test)_/.test(token))fail('LIVE_READER_TOKEN');
    async function get(path){
     const r=await mollieFetch('https://api.mollie.com/v2/'+path,{method:'GET',headers:{Authorization:'Bearer '+token,Accept:'application/json'}},fetcher);
     if(!r.ok||!/^application\/(?:json|hal\+json)(?:\s*;|\s*$)/i.test(r.headers?.get?.('content-type')||''))fail('LIVE_READER_UNAVAILABLE');
     return r.json();
    }
    const organization=await get('organizations/me'),profile=await get('profiles/'+b.profileId);
    if(organization?.id!==b.merchantId||profile?.id!==b.profileId||profile.status!=='verified')fail('LIVE_READER_BINDING');
    const raw=await get('payments/'+args.providerId);
    if(raw?.resource!=='payment'||raw.mode!=='live'||!['open','pending','authorized','paid','failed','expired','canceled'].includes(raw.status)||raw.id!==args.providerId||raw.profileId!==b.profileId||raw.sequenceType!=='oneoff'||raw.subscriptionId||raw.mandateId||raw.applicationFee||raw.routing||raw.metadata?.marketOrderId!==args.orderId||raw.metadata?.marketSellerCompanyId!==b.sellerCompanyId||typeof raw.metadata?.marketCheckoutKey!=='string'||!raw.metadata.marketCheckoutKey.startsWith('market-live:')||!uuid(raw.metadata.marketCheckoutKey.slice(12)))fail('LIVE_READER_PAYMENT');
    const amountCents=providerEuroCents(raw.amount);if(amountCents<=0)fail('LIVE_READER_PAYMENT');
    const payment=Object.freeze({...b,id:raw.id,orderId:args.orderId,mode:'live',status:raw.status,amountCents,currency:'EUR',amountRefundedCents:raw.amountRefunded?providerEuroCents(raw.amountRefunded):0,amountChargedBackCents:raw.amountChargedBack?providerEuroCents(raw.amountChargedBack):0,feeCents:null});
    return operation(get,payment,b);
   });
   if(!used||JSON.stringify(binding(await loadBinding(b.sellerCompanyId)))!==JSON.stringify(b))fail('LIVE_READER_BINDING');
   return value;
  }catch(error){fail(['LIVE_READER_BINDING','LIVE_READER_PAYMENT','LIVE_READER_REFUND','LIVE_READER_TOKEN'].includes(error?.message)?error.message:'LIVE_READER_UNAVAILABLE');}
 }
 return Object.freeze({
  fetchPayment:args=>read(args,async(_get,p)=>p),
  async fetchRefund(args){
   if(!/^re_[A-Za-z0-9]{1,100}$/.test(args?.refundId||''))fail('LIVE_READER_INPUT');
   return read(args,async(get,p,b)=>{
    if(p.status!=='paid')fail('LIVE_READER_PAYMENT');
    const r=await get('payments/'+args.providerId+'/refunds/'+args.refundId);
    if(r?.resource!=='refund'||r.mode!=='live'||r.id!==args.refundId||r.paymentId!==p.id||r.status!=='refunded')fail('LIVE_READER_REFUND');
    const amountCents=providerEuroCents(r.amount);if(amountCents<=0||amountCents>p.amountRefundedCents)fail('LIVE_READER_REFUND');
    return Object.freeze({...b,id:r.id,paymentId:p.id,orderId:p.orderId,mode:'live',status:r.status,amountCents,currency:'EUR'});
   });
  }
 });
}
