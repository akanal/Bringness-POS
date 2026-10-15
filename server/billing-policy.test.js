import {test} from 'node:test';
import assert from 'node:assert/strict';
import {billingPolicy} from './billing-policy.js';

test('Grundkasse ist Voraussetzung fuer Restaurant und QR',()=>{
 const p=billingPolicy();
 assert.equal(p.plans.restaurant_monthly.eligible,false);
 assert.equal(p.plans.table_qr_monthly.eligible,false);
 assert.deepEqual(p.plans.restaurant_monthly.requires,['pos_base']);
});
test('Grundkasse erlaubt optionale Module',()=>{
 const p=billingPolicy({base:true});
 assert.equal(p.plans.restaurant_monthly.eligible,true);
 assert.equal(p.plans.table_qr_monthly.eligible,true);
});
test('Restaurant allein ersetzt keine Grundkasse',()=>{
 const p=billingPolicy({restaurant:true});
 assert.equal(p.features.pos_base,false);
 assert.equal(p.features.restaurant,false);
});
test('QR aktiviert zwingend Tischverwaltung',()=>{
 const p=billingPolicy({base:true,tableQr:true});
 assert.equal(p.features.table_qr,true);
 assert.equal(p.features.table_management,true);
 assert.equal(p.plans.table_management_monthly.active,true);
 assert.equal(p.plans.table_management_monthly.eligible,false);
 assert.equal(p.plans.table_management_monthly.monthlyNetCents,990);
 assert.deepEqual(p.plans.table_qr_monthly.requires,['pos_base','table_management_monthly']);
});
test('Tischverwaltung endet zusammen mit QR',()=>{
 const p=billingPolicy({base:true,tableQr:false});
 assert.equal(p.features.table_management,false);
});
test('Download-Lizenz ermoeglicht Basiskasse und Zusatzmodule',()=>{
 const p=billingPolicy({download:true});
 assert.equal(p.features.pos_base,true);
 assert.equal(p.plans.restaurant_monthly.eligible,true);
 assert.equal(p.plans.table_qr_monthly.eligible,true);
});
