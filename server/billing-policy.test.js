import {test} from 'node:test';
import assert from 'node:assert/strict';
import {billingPolicy} from './billing-policy.js';
const cases=[
 ['Normaler Tarif ist direkt buchbar',{},p=>assert(p.plans.pos_base_monthly.eligible)],
 ['Restaurant ist für neue Buchungen eingestellt',{},p=>assert.equal(p.plans.restaurant_monthly.eligible,false)],
 ['Restaurant verlangt kein Basis-Abo',{},p=>assert.deepEqual(p.plans.restaurant_monthly.requires,[])],
 ['Restaurant enthält die normale Kasse',{restaurant:true},p=>assert(p.features.pos_base)],
 ['Restaurant enthält kein Tisch-QR',{restaurant:true},p=>assert.equal(p.features.table_qr,false)],
 ['Keine doppelte Basisbuchung im Restaurant',{restaurant:true},p=>assert.equal(p.plans.pos_base_monthly.eligible,false)],
 ['Basis als enthalten gekennzeichnet',{restaurant:true},p=>assert(p.plans.pos_base_monthly.included)],
 ['QR braucht eine Kasse',{},p=>assert.equal(p.plans.table_qr_monthly.eligible,false)],
 ['QR zum Restaurant buchbar',{restaurant:true},p=>assert(p.plans.table_qr_monthly.eligible)],
 ['QR braucht kein zusätzliches Basis-Abo',{restaurant:true,tableQr:true},p=>assert(p.features.table_qr)],
 ['Download enthält nur die normale Kasse',{download:true},p=>{assert(p.features.pos_base);assert.equal(p.features.table_management,false);assert.equal(p.features.personnel,false);assert.equal(p.features.kitchen,false)}],
 ['Download erlaubt QR ohne Restaurant',{download:true},p=>{assert.equal(p.plans.restaurant_monthly.eligible,false);assert.equal(p.plans.table_qr_monthly.eligible,false);assert(p.plans.table_management_monthly.eligible)}],
 ['Download ist Alternative zum Monatsabo',{base:true},p=>assert.equal(p.plans.download_license.eligible,false)]
];
for(const [name,input,check]of cases)test(name,()=>check(billingPolicy(input)));

for(const kind of ['base','download'])test(kind+' QR schaltet keine Restaurant-Funktionen frei',()=>{const p=billingPolicy({[kind]:true,tableManagement:true,tableQr:true});assert(p.features.table_qr);assert.equal(p.features.restaurant,false)});

for(const kind of ['base','download'])test(kind+' optional personnel and kitchen need no tables',()=>{const p=billingPolicy({[kind]:true,personnel:true,kitchen:true});assert(p.features.personnel);assert(p.features.kitchen);assert.equal(p.features.table_management,false);assert(p.plans.table_management_monthly.eligible)});
