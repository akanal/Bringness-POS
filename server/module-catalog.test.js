import test from 'node:test';import assert from 'node:assert/strict';
import {moduleCatalog,moduleBookingError,planFeature,migrateModuleCatalog,orderingModuleAccess} from './module-catalog.js';
test('approved module prices and table prerequisites',()=>{for(const code of ['table_qr_monthly','counter_qr_monthly','center_monthly']){assert.equal(moduleCatalog[code].netCents,2999);assert(moduleBookingError(code,{pos_base:true}));assert.equal(moduleBookingError(code,{pos_base:true,table_management:true}),null)}for(const code of ['table_management_monthly','personnel_monthly','kitchen_monthly']){assert.equal(moduleCatalog[code].netCents,999);assert.equal(moduleBookingError(code,{pos_base:true}),null)}assert(moduleBookingError('restaurant_monthly',{}));assert.equal(planFeature('personnel_monthly'),'personnel')});
test('center stays separate and download base can add modules',()=>{assert(moduleBookingError('center_monthly',{pos_base:true,table_management:true,table_qr:true}));assert(moduleBookingError('table_qr_monthly',{pos_base:true,table_management:true,center:true}));assert.equal(moduleBookingError('personnel_monthly',{pos_base:true}),null)});
test('catalogue migration never rewrites paid customer contracts',async()=>{const queries=[];await migrateModuleCatalog({query:async(sql,values)=>queries.push({sql,values})});assert.equal(queries.length,9);assert(queries.every(q=>!/(UPDATE|DELETE FROM) (company_entitlements|billing_transactions|company_billing_terms)/i.test(q.sql)));assert(queries.some(q=>q.values?.[0]==='kitchen_monthly'&&q.values[2]===999))});

test('display control is 14.99 monthly and needs only a base',()=>{assert.equal(moduleCatalog.display_control_monthly.netCents,1499);assert.equal(moduleBookingError('display_control_monthly',{pos_base:true}),null);assert(moduleBookingError('display_control_monthly',{}));});

// Tisch-QR includes the owner's optional self-pickup workflow (1 November 2026).
test('table QR permits self pickup while base, tables and Center boundaries remain enforced',async()=>{
 const access=async(features,mode)=>orderingModuleAccess({query:async(sql)=>sql.startsWith('SELECT feature_code')?{rows:features.map(feature_code=>({feature_code})),rowCount:features.length}:{rows:[],rowCount:0}},'company',mode);
 assert.equal(await access(['pos_base','table_management','table_qr'],'pickup'),true);
 assert.equal(await access(['pos_base','table_management','table_qr'],'restaurant'),true);
 assert.equal(await access(['pos_base','table_management','counter_qr'],'pickup'),true);
 assert.equal(await access(['pos_base','table_management','table_qr'],'center'),false);
 assert.equal(await access(['table_management','table_qr'],'pickup'),false);
 assert.equal(await access(['pos_base','table_qr'],'pickup'),false);
 assert.equal(await access(['pos_base','table_management'],'pickup'),false);
 assert.equal(await access(['pos_base','table_management','center'],'pickup'),false);
});
