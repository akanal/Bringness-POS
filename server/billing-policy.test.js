import {test} from 'node:test';
import assert from 'node:assert/strict';
import {billingPolicy} from './billing-policy.js';
const cases=[
 ['Normaler Tarif ist direkt buchbar',{},p=>assert(p.plans.pos_base_monthly.eligible)],
 ['Restaurant ist ohne Basis-Abo buchbar',{},p=>assert(p.plans.restaurant_monthly.eligible)],
 ['Restaurant verlangt kein Basis-Abo',{},p=>assert.deepEqual(p.plans.restaurant_monthly.requires,[])],
 ['Restaurant enthält die normale Kasse',{restaurant:true},p=>assert(p.features.pos_base)],
 ['Restaurant enthält kein Tisch-QR',{restaurant:true},p=>assert.equal(p.features.table_qr,false)],
 ['Keine doppelte Basisbuchung im Restaurant',{restaurant:true},p=>assert.equal(p.plans.pos_base_monthly.eligible,false)],
 ['Basis als enthalten gekennzeichnet',{restaurant:true},p=>assert(p.plans.pos_base_monthly.included)],
 ['QR braucht eine Kasse',{},p=>assert.equal(p.plans.table_qr_monthly.eligible,false)],
 ['QR zum Restaurant buchbar',{restaurant:true},p=>assert(p.plans.table_qr_monthly.eligible)],
 ['QR braucht kein zusätzliches Basis-Abo',{restaurant:true,tableQr:true},p=>assert(p.features.table_qr)],
 ['Download enthält nur die normale Kasse',{download:true},p=>assert.deepEqual(p.features,{pos_base:true,restaurant:false,table_qr:false})],
 ['Download erlaubt QR ohne Restaurant',{download:true},p=>{assert.equal(p.plans.restaurant_monthly.eligible,false);assert.equal(p.plans.table_qr_monthly.eligible,true)}],
 ['Download ist Alternative zum Monatsabo',{base:true},p=>assert.equal(p.plans.download_license.eligible,false)]
];
for(const [name,input,check]of cases)test(name,()=>check(billingPolicy(input)));

for(const kind of ['base','download'])test(kind+' QR schaltet keine Restaurant-Funktionen frei',()=>{const p=billingPolicy({[kind]:true,tableQr:true});assert(p.features.table_qr);assert.equal(p.features.restaurant,false)});
