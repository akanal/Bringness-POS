import test from 'node:test';
import assert from 'node:assert/strict';
import {mayRead,supportAnswer} from './support-policy.js';
test('Kellner sehen keine fremden Gespräche; Inhaber nur ihren Betrieb',()=>{const c={company_id:'A',user_id:'1'};assert.equal(mayRead({company_id:'A',id:'2',role:'waiter'},c),false);assert.equal(mayRead({company_id:'A',id:'1',role:'waiter'},c),true);assert.equal(mayRead({company_id:'B',id:'3',role:'owner'},c),false);assert.equal(mayRead({company_id:'A',id:'3',role:'owner'},c),true);assert.equal(mayRead({platform:true},c),true)});
test('Vorlagen passen zur Rolle; unbekannte Fragen gehen zur Bearbeitung',()=>{assert.equal(supportAnswer('Meine Tische fehlen','waiter')?.title,'Meine Tische fehlen');assert.equal(supportAnswer('Artikel und Speisekarte','owner')?.title,'Artikel und Speisekarte');assert.equal(supportAnswer('Artikel und Speisekarte','waiter'),null);assert.equal(supportAnswer('Fehlermeldung ZX994','owner'),null)});
