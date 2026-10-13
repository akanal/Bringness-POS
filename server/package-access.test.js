import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createPackageAccess,packageRequirement} from './package-access.js';
test('package routes keep callbacks and platform controls independent',()=>{assert.equal(packageRequirement('/api/v1/centers/mollie/webhook'),null);assert.equal(packageRequirement('/api/v1/platform/personnel/report'),null);assert.equal(packageRequirement('/api/v1/displays'), 'restaurant');assert.equal(packageRequirement('/api/v1/waiter/qr-orders'),'table_service')});
for(const base of ['download','online'])test(base+' QR grants service but excludes Center, displays and personnel reports',async()=>{
 const pool={query:async(sql,args)=>sql.includes('FROM sessions')?{rows:[{company_id:'company'}]}:sql.includes('company_features')?{rowCount:args[1]==='table_qr'||args[1]==='pos_base'&&base==='online'?1:0}:{rowCount:base==='download'?1:0}};
 const gate=createPackageAccess(pool),req=path=>({url:path,headers:{authorization:'Bearer test'}});let status;
 const res={writeHead:s=>status=s,end(){}};
 assert.equal(await gate(req('/api/v1/waiter/qr-orders'),res),false);
 for(const path of ['/api/v1/centers','/api/v1/displays','/api/v1/personnel/report']){assert.equal(await gate(req(path),res),true);assert.equal(status,402)}
});
test('expired QR revokes service without blocking ordinary POS or deleting data',async()=>{const gate=createPackageAccess({query:async sql=>sql.includes('FROM sessions')?{rows:[{company_id:'company'}]}:{rowCount:0}});let status;const res={writeHead:s=>status=s,end(){}};assert(await gate({url:'/api/v1/waiter/qr-orders',headers:{authorization:'Bearer test'}},res));assert.equal(status,402);assert.equal(await gate({url:'/api/v1/orders',headers:{}},res),false)});
