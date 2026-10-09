import {test} from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import {handleBillingStatus} from './billing-status.js';
let features=[],entitlements=[];
const original=pg.Pool.prototype.query;
pg.Pool.prototype.query=async function(sql){
 if(sql.includes('FROM sessions'))return {rows:[{id:'owner',company_id:'company',role:'owner'}]};
 if(sql.includes('FROM billing_plans bp'))return {rows:['pos_base_monthly','restaurant_monthly','table_qr_monthly','download_license'].map((code,i)=>({code,amount_cents:[2999,6999,2999,39900][i],currency:'EUR',billing_type:i===3?'one_time':'monthly'}))};
 if(sql.includes('FROM company_features'))return {rows:features};
 if(sql.includes('FROM company_entitlements'))return {rows:entitlements};
 throw Error('Unexpected query');
};
async function status(){let result;await handleBillingStatus({url:'/api/v1/billing/status',method:'GET',headers:{authorization:'Bearer test'}},{writeHead(code){assert.equal(code,200)},end(raw){result=JSON.parse(raw)}});return result}
const feature=code=>({feature_code:code,status:'active'});
test('existing free base access does not mark an unpaid subscription as bought',async()=>{features=[feature('pos_base')];entitlements=[];const s=await status();assert(s.features.pos_base);assert(s.plans.find(p=>p.code==='pos_base_monthly').eligible);assert(s.plans.find(p=>p.code==='restaurant_monthly').eligible)});
test('restaurant enables base without a separate base feature or QR',async()=>{features=[feature('restaurant')];entitlements=[];const s=await status();assert.deepEqual(s.features,{pos_base:true,restaurant:true,table_qr:false});assert(s.plans.find(p=>p.code==='pos_base_monthly').included);assert.equal(s.plans.find(p=>p.code==='restaurant_monthly').amount,69.99)});
test('download cannot book restaurant or QR and costs 399 euros',async()=>{features=[];entitlements=[{code:'download_license',status:'active'}];const s=await status();assert(s.features.pos_base);assert(s.downloadOnly);for(const code of ['restaurant_monthly','table_qr_monthly'])assert.equal(s.plans.find(p=>p.code===code).eligible,false);assert.equal(s.plans.find(p=>p.code==='download_license').amount,399)});
test('expired restaurant disables QR even if QR feature remains active',async()=>{features=[{...feature('restaurant'),ends_at:'2020-01-01'},feature('table_qr')];entitlements=[];const s=await status();assert.equal(s.features.table_qr,false);assert.equal(s.plans.find(p=>p.code==='table_qr_monthly').eligible,false)});
test.after(()=>{pg.Pool.prototype.query=original});
