import {test} from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import {handleBillingStatus} from './billing-status.js';
let features=[],entitlements=[];
const original=pg.Pool.prototype.query;
pg.Pool.prototype.query=async function(sql){
 if(sql.includes('FROM sessions'))return {rows:[{id:'owner',company_id:'company',role:'owner'}]};
 if(sql.includes('FROM billing_plans bp'))return {rows:['pos_base_monthly','table_management_monthly','table_qr_monthly','download_license'].map((code,i)=>({code,amount_cents:[2999,990,2999,39900][i],currency:'EUR',billing_type:i===3?'one_time':'monthly'}))};
 if(sql.includes('FROM company_features'))return {rows:features};
 if(sql.includes('FROM company_entitlements'))return {rows:entitlements};
 throw Error('Unexpected query');
};
async function status(){let result;await handleBillingStatus({url:'/api/v1/billing/status',method:'GET',headers:{authorization:'Bearer test'}},{writeHead(code){assert.equal(code,200)},end(raw){result=JSON.parse(raw)}});return result}
const feature=code=>({feature_code:code,status:'active'});
test('existing free base access does not mark an unpaid subscription as bought',async()=>{features=[feature('pos_base')];entitlements=[];const s=await status();assert(s.features.pos_base);assert(s.plans.find(p=>p.code==='pos_base_monthly').eligible);assert.equal(s.plans.find(p=>p.code==='table_qr_monthly').eligible,true)});
test('paid base entitlement is not duplicated',async()=>{features=[feature('pos_base')];entitlements=[{code:'pos_base_monthly',status:'active'}];const s=await status();assert.equal(s.plans.find(p=>p.code==='pos_base_monthly').eligible,false);assert.equal(s.plans.find(p=>p.code==='pos_base_monthly').active,true)});
test('download can book QR without restaurant and costs 399 euros',async()=>{features=[];entitlements=[{code:'download_license',status:'active'}];const s=await status();assert(s.features.pos_base);assert(s.downloadOnly);assert.equal(s.plans.find(p=>p.code==='pos_base_monthly').eligible,false);assert(s.plans.find(p=>p.code==='table_qr_monthly').eligible);assert.equal(s.plans.find(p=>p.code==='download_license').amount,399)});
test('expired QR feature is not active',async()=>{features=[feature('pos_base'),{...feature('table_qr'),ends_at:'2020-01-01'}];entitlements=[];const s=await status();assert.equal(s.features.table_qr,false);assert.equal(s.plans.find(p=>p.code==='table_qr_monthly').eligible,true)});
test('canceled QR remains available until paid end, then base POS remains',async()=>{features=[feature('pos_base'),{...feature('table_qr'),payment_status:'canceled',ends_at:'2099-01-01'}];entitlements=[];let s=await status();assert(s.features.table_qr);assert.equal(s.features.table_management,true);features[1].ends_at='2020-01-01';s=await status();assert.equal(s.features.table_qr,false);assert(s.features.pos_base)});
test.after(()=>{pg.Pool.prototype.query=original});
