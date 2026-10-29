import {mollieFetch} from './mollie-request.js';
import {providerEuroCents} from './provider-money.js';
import {uuid} from './shop-drafts.js';
import {paymentId,safeCheckoutUrl} from './shop-provider-proof.js';

const fail=code=>{throw Error(code);};
const adapterErrors=new Set(['MARKET_MERCHANT_NOT_CONNECTED','MARKET_MERCHANT_CHANGED','MARKET_PROVIDER_CALLBACK_REPEATED','MARKET_OAUTH_TOKEN_REQUIRED','MARKET_PAYMENT_UNCERTAIN','MARKET_PAYMENT_MISMATCH','MARKET_RECOVERY_INCOMPLETE','MARKET_RECOVERY_AMBIGUOUS']);
async function guarded(fn){try{return await fn();}catch(error){fail(adapterErrors.has(error?.message)?error.message:'MARKET_PAYMENT_UNCERTAIN');}}
const statuses=new Set(['open','pending','authorized','paid','failed','expired','canceled']);
const intentKey=value=>typeof value==='string'&&value.startsWith('market-test:')&&uuid(value.slice(12));
const centsString=cents=>`${BigInt(cents)/100n}.${String(BigInt(cents)%100n).padStart(2,'0')}`;
function connection(value,seller){
 if(!value||value.kind!=='mollie-oauth'||value.mode!=='test'||value.status!=='verified'||
  value.sellerCompanyId!==seller||!uuid(value.connectionId)||!/^org_[A-Za-z0-9]{1,100}$/.test(value.merchantId||'')||
  !/^pfl_[A-Za-z0-9]{1,100}$/.test(value.profileId||''))fail('MARKET_MERCHANT_NOT_CONNECTED');
 return Object.freeze({sellerCompanyId:seller,connectionId:value.connectionId,merchantId:value.merchantId,profileId:value.profileId});
}
function same(a,b){return Object.keys(a).every(k=>a[k]===b[k]);}
function command(value,binding){
 if(!value||value.mode!=='test'||value.sellerCompanyId!==binding.sellerCompanyId||value.merchantId!==binding.merchantId||
  !uuid(value.orderId)||!intentKey(value.idempotencyKey)||value.currency!=='EUR'||!Number.isSafeInteger(value.amountCents)||value.amountCents<=0)fail('INVALID_MARKET_PROVIDER_COMMAND');
 return Object.freeze({orderId:value.orderId,sellerCompanyId:value.sellerCompanyId,merchantId:value.merchantId,
  amountCents:value.amountCents,currency:'EUR',mode:'test',idempotencyKey:value.idempotencyKey});
}
function normalize(raw,binding,expected){
 try{
  if(raw?.resource!=='payment'||raw.mode!=='test'||raw.profileId!==binding.profileId||!paymentId(raw.id)||!statuses.has(raw.status)||
   raw.sequenceType!=='oneoff'||raw.subscriptionId||raw.mandateId||raw.applicationFee||raw.routing||
   raw.metadata?.marketSellerCompanyId!==binding.sellerCompanyId||!uuid(raw.metadata?.marketOrderId)||!intentKey(raw.metadata?.marketCheckoutKey)||
   (raw.amountRefunded&&providerEuroCents(raw.amountRefunded)!==0)||(raw.amountChargedBack&&providerEuroCents(raw.amountChargedBack)!==0))throw Error();
  const amountCents=providerEuroCents(raw.amount);if(amountCents<=0)throw Error();
  if(expected&&(raw.metadata.marketOrderId!==expected.orderId||raw.metadata.marketCheckoutKey!==expected.idempotencyKey||amountCents!==expected.amountCents))throw Error();
  const checkoutUrl=['open','pending','authorized'].includes(raw.status)?raw._links?.checkout?.href:null;
  if(checkoutUrl!==null&&(typeof checkoutUrl!=='string'||checkoutUrl.length>2048||!safeCheckoutUrl(checkoutUrl)))throw Error();
  return Object.freeze({id:raw.id,mode:'test',merchantId:binding.merchantId,orderId:raw.metadata.marketOrderId,
   amountCents,currency:'EUR',status:raw.status,checkoutUrl});
 }catch{fail('MARKET_PAYMENT_MISMATCH');}
}
// Server-only injection boundary. No environment fallback, credential persistence,
// startup registration, HTTP onboarding or live mode. Both callbacks are trusted
// host integrations, never browser-supplied data. withAccessToken must enforce the
// exact seller + connection revision and securely refresh OAuth credentials.
export function createMarketplaceMollieTestResolver({loadConnection,withAccessToken,publicOrigin,fetcher=globalThis.fetch,maxRecoveryPages=4}={}){
 if(typeof loadConnection!=='function'||typeof withAccessToken!=='function'||typeof fetcher!=='function')fail('INVALID_MARKET_PROVIDER_CONFIG');
 if(!Number.isSafeInteger(maxRecoveryPages)||maxRecoveryPages<1||maxRecoveryPages>10)fail('INVALID_MARKET_PROVIDER_CONFIG');
 let origin;try{const u=new URL(publicOrigin);if(u.protocol!=='https:'||u.origin!==publicOrigin||u.username||u.password)throw Error();origin=u.origin;}catch{fail('INVALID_MARKET_PROVIDER_ORIGIN');}
 return async function resolveProvider(seller){
  if(!uuid(seller))fail('INVALID_MARKET_PROVIDER_COMMAND');
  const binding=connection(await guarded(()=>loadConnection(seller)),seller);
  async function active(){const now=connection(await guarded(()=>loadConnection(seller)),seller);if(!same(binding,now))fail('MARKET_MERCHANT_CHANGED');}
  async function using(operation){
   await active();let invoked=false;
   const result=await guarded(()=>withAccessToken(seller,binding.connectionId,async token=>{
    if(invoked)fail('MARKET_PROVIDER_CALLBACK_REPEATED');invoked=true;
    if(typeof token!=='string'||token.length<10||token.length>4096||/\s/.test(token)||/^(test|live)_/.test(token))fail('MARKET_OAUTH_TOKEN_REQUIRED');
    async function request(path,{body,key}={}){
     try{
      const response=await mollieFetch('https://api.mollie.com/v2/'+path,{method:body?'POST':'GET',
       headers:{Authorization:'Bearer '+token,Accept:'application/json',...(body?{'Content-Type':'application/json','Idempotency-Key':key}:{})},
       ...(body?{body:JSON.stringify(body)}:{})},fetcher);
      if(!response.ok||!/^application\/json(?:\s*;|\s*$)/i.test(response.headers?.get?.('content-type')||''))throw Error();
      return await response.json();
     }catch{fail('MARKET_PAYMENT_UNCERTAIN');}
    }
    // Verify the actual OAuth account and profile before every payment operation.
    const organization=await request('organizations/me'),profile=await request('profiles/'+binding.profileId);
    if(organization?.id!==binding.merchantId||profile?.id!==binding.profileId||profile.status!=='verified')fail('MARKET_MERCHANT_NOT_CONNECTED');
    await active();return operation(request);
   }));
   if(!invoked)fail('MARKET_MERCHANT_NOT_CONNECTED');await active();return result;
  }
  const query=()=>new URLSearchParams({profileId:binding.profileId,testmode:'true'});
  const getPayment=async(request,id,expected)=>{
   const raw=await request('payments/'+id+'?'+query());
   if(raw?.id!==id)fail('MARKET_PAYMENT_MISMATCH');return normalize(raw,binding,expected);
  };
  return Object.freeze({mode:'test',sellerCompanyId:seller,merchantId:binding.merchantId,
   async createPayment(value){
    const c=command(value,binding);
    return using(async request=>normalize(await request('payments',{key:c.idempotencyKey,body:{
     amount:{currency:'EUR',value:centsString(c.amountCents)},description:'Bringness Marktplatz '+c.orderId,
     redirectUrl:origin+'/shop/order-history.html?marketOrderId='+c.orderId,
     profileId:binding.profileId,testmode:true,sequenceType:'oneoff',
     metadata:{marketOrderId:c.orderId,marketSellerCompanyId:seller,marketCheckoutKey:c.idempotencyKey}
    }}),binding,c));
   },
   async fetchPayment(id){if(!paymentId(id))fail('INVALID_MARKET_PROVIDER_COMMAND');return using(request=>getPayment(request,id));},
   async recoverPayment(value){
    const c=command(value,binding);
    return using(async request=>{
     let from,found;const seen=new Set(),cursors=new Set();
     for(let page=0;page<maxRecoveryPages;page++){
      const params=query();params.set('limit','50');params.set('sort','desc');if(from)params.set('from',from);
      const data=await request('payments?'+params),payments=data?._embedded?.payments;
      if(!Array.isArray(payments)||payments.length>50||data.count!==payments.length)fail('MARKET_RECOVERY_INCOMPLETE');
      for(const raw of payments){
       if(raw?.resource!=='payment'||raw.mode!=='test'||raw.profileId!==binding.profileId||!paymentId(raw.id)||seen.has(raw.id))fail('MARKET_RECOVERY_INCOMPLETE');seen.add(raw.id);
       const meta=raw.metadata;
       if(meta?.marketCheckoutKey===c.idempotencyKey||meta?.marketOrderId===c.orderId){
        const verified=normalize(raw,binding,c);if(found)fail('MARKET_RECOVERY_AMBIGUOUS');found=verified.id;
       }
      }
      const next=data._links?.next?.href;
      if(next==null)return found?getPayment(request,found,c):null;
      // Never follow provider-supplied URLs. Validate a complete fixed query and
      // reconstruct the next request; redirects cannot receive OAuth credentials.
      let nextUrl;try{nextUrl=new URL(next);}catch{fail('MARKET_RECOVERY_INCOMPLETE');}
      const keys=['profileId','testmode','limit','sort','from'];
      if(nextUrl.origin!=='https://api.mollie.com'||nextUrl.pathname!=='/v2/payments'||nextUrl.username||nextUrl.password||nextUrl.hash||
       [...nextUrl.searchParams.keys()].some(k=>!keys.includes(k))||keys.some(k=>nextUrl.searchParams.getAll(k).length!==1)||
       nextUrl.searchParams.get('profileId')!==binding.profileId||nextUrl.searchParams.get('testmode')!=='true'||
       nextUrl.searchParams.get('limit')!=='50'||nextUrl.searchParams.get('sort')!=='desc'||!paymentId(nextUrl.searchParams.get('from')))fail('MARKET_RECOVERY_INCOMPLETE');
      from=nextUrl.searchParams.get('from');if(cursors.has(from))fail('MARKET_RECOVERY_INCOMPLETE');cursors.add(from);
     }
     fail('MARKET_RECOVERY_INCOMPLETE');
    });
   }
  });
 };
}
