import {test} from 'node:test';import assert from 'node:assert/strict';
import {filterProducts,reviewCart,loadCart,saveCart,products} from '../../apps/web/public/shop/catalog.js';
import {shopPreview,validateShopCart} from '../../server/shop-preview-policy.js';
const profile={company_name:'Fixture',street:'Example 1',postal_code:'10115',city:'Berlin',country:'DE'};
const plans=[{code:'pos_base_monthly',amount_cents:3499,active:true,currency:'EUR',billing_type:'monthly'},{code:'download_license',amount_cents:39900,active:true,currency:'EUR',billing_type:'one_time'}];
const preview=(extra={})=>shopPreview({cart:{'pos-online':1},plans,profile,...extra});
test('catalog retains agreed prices and no AI price',()=>{assert.deepEqual(products.map(p=>p.netCents),[3499,39900,null]);assert.equal(filterProducts(' WINDOWS ').length,1);assert.equal(filterProducts('','Hardware').length,0);});
test('monthly and once totals are separated with VAT',()=>{const r=reviewCart({'pos-online':1,'pos-download':1});assert.deepEqual(r.groups,[{period:'monthly',netCents:3499,vatCents:665,grossCents:4164},{period:'once',netCents:39900,vatCents:7581,grossCents:47481}]);assert.equal(r.canPay,false);});
for(const cart of [null,[],{'bringness-ai':1},{'pos-online':0},{'pos-online':1.5},{'pos-online':'1'},{'pos-online':100},JSON.parse('{"__proto__":1}')])test(`reject invalid cart ${JSON.stringify(cart)}`,()=>{assert.throws(()=>reviewCart(cart));assert.throws(()=>validateShopCart(cart));});
test('storage failure is recoverable; malformed storage discarded',()=>{assert.deepEqual(loadCart({getItem:()=>'{broken'}),{});assert.equal(saveCart({setItem(){throw Error();}},{'pos-online':1}),false);});
test('server quote has exact price expiry and no authority',()=>{const q=preview({now:'2026-10-24T10:00:00Z'});assert.equal(q.lines[0].grossCents,4164);assert.equal(q.expiresAt,'2026-10-24T10:05:00.000Z');assert.deepEqual(q.issues,[]);assert.equal(q.canActivate,false);});
test('special price discount applies only to monthly plan',()=>{const p=plans.map(p=>({...p,monthly_net_cents:1999}));assert.equal(preview({plans:p}).lines[0].netCents,1999);assert.equal(preview({plans:p,cart:{'pos-download':1}}).lines[0].netCents,39900);});
test('higher account offer cannot increase agreed public price',()=>assert.equal(preview({plans:plans.map(p=>({...p,monthly_net_cents:9999}))}).lines[0].netCents,3499));
test('wrong currency, inactive plan and billing period are unavailable',()=>{for(const change of [{currency:'USD'},{active:false},{billing_type:'one_time'}])assert.ok(preview({plans:[{...plans[0],...change}]}).issues.includes('plan_unavailable'));});
test('unsafe amounts rejected',()=>{for(const amount_cents of [true,0,-1,2147483647,'NaN'])assert.ok(preview({plans:[{...plans[0],amount_cents}]}).issues.includes('invalid_server_price'));});
test('profile incomplete, multi-base and quantity constraints',()=>{assert.ok(preview({profile:{}}).issues.includes('billing_profile_incomplete'));assert.ok(preview({cart:{'pos-online':1,'pos-download':1}}).issues.includes('base_license_conflict'));assert.ok(preview({cart:{'pos-online':2}}).issues.includes('quantity_not_supported'));});
test('billing preflight rejects oversized and control-containing fields before checkout',()=>{
 for(const field of Object.keys(profile))for(const value of ['x'.repeat(501),'Company\u0000Name','Name\nInjected','Name\u007f',null,'  ']){
  const quote=preview({profile:{...profile,[field]:value}});assert.equal(quote.account.profileComplete,false);assert.ok(quote.issues.includes('billing_profile_incomplete'),field);assert.equal(quote.canPay,false);
 }
 assert.equal(preview({profile:{...profile,company_name:'x'.repeat(500)}}).account.profileComplete,true);
 assert.equal(preview({profile:{...profile,company_name:'Müller & Söhne GmbH'}}).account.profileComplete,true);
});
test('paid-through canceled base blocks; expired base does not',()=>{const e={code:'download_license',status:'canceled',current_period_end:'2030-01-01'};assert.ok(preview({entitlements:[e]}).issues.includes('already_active'));assert.ok(!preview({entitlements:[{...e,current_period_end:'2020-01-01'}]}).issues.includes('already_active'));});
test('legacy paid feature blocks while trial does not',()=>{const f={feature_code:'restaurant',status:'active',payment_status:'paid'};assert.ok(preview({features:[f]}).issues.includes('already_active'));assert.ok(!preview({features:[{...f,payment_status:'trial'}]}).issues.includes('already_active'));});
test('an active overdue subscription still blocks a duplicate contract',()=>assert.ok(preview({entitlements:[{code:'pos_base_monthly',status:'active',current_period_end:'2020-01-01'}]}).issues.includes('already_active')));

test('Windows preflight shares buyer and date limits with invoice preparation',()=>{
 const base={cart:{'pos-download':1},now:'2026-10-24T10:00:00Z'};
 for(const country of ['DE',' de ','Deutschland','GERMANY'])assert.deepEqual(preview({...base,profile:{...profile,country}}).issues,[]);
 for(const country of ['AT','FR','US','unknown']){const q=preview({...base,profile:{...profile,country}});assert.equal(q.account.profileComplete,true);assert.ok(q.issues.includes('download_buyer_unsupported'));assert.equal(q.canPay,false);}
 for(const field of ['company_name','street','postal_code','city'])assert.ok(preview({...base,profile:{...profile,[field]:'x'}}).issues.includes('download_buyer_unsupported'));
 assert.ok(preview({...base,now:'2026-12-31T23:00:00Z'}).issues.includes('download_invoice_format_not_ready'));
 assert.deepEqual(preview({...base,now:'2026-12-31T22:59:59Z'}).issues,[]);
 assert.ok(preview({...base,now:'2024-12-31T22:59:59Z'}).issues.includes('download_invoice_format_not_ready'));
 assert.deepEqual(preview({...base,now:'2024-12-31T23:00:00Z'}).issues,[]);
 // This is the existing Windows implementation limit, not a new monthly policy.
 assert.deepEqual(preview({now:'2027-01-01T10:00:00Z',profile:{...profile,country:'AT'}}).issues,[]);
});
