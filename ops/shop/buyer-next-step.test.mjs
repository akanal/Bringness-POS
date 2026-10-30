import {test} from 'node:test';import assert from 'node:assert/strict';import {buyerNextStep} from '../../apps/web/public/shop/buyer-next-step.js';
test('buyer guidance distinguishes merchant status, missing tracking and test-only holds',()=>{
 assert.match(buyerNextStep({status:'received'}).text,/noch nicht angenommen/);
 assert.match(buyerNextStep({status:'accepted',method:'pickup'}).text,/Abholbereit/);
 assert.match(buyerNextStep({status:'accepted',method:'shipping'}).text,/kein Versandnachweis/);
 assert.match(buyerNextStep({status:'ready_for_pickup'}).text,/bestätigt keine Zahlung/);
 assert.match(buyerNextStep({status:'shipped'}).text,/nicht vor/);
 assert.match(buyerNextStep({status:'shipped',tracking:{}}).text,/keine Zustellung/);
 assert.match(buyerNextStep({status:'rejected'}).text,/keine Lieferung/);
 assert.match(buyerNextStep({status:'cancelled'}).text,/kein Erstattungsnachweis/);
 assert.match(buyerNextStep({status:'mystery'}).text,/nicht sicher/);
 for(const status of ['received','accepted','ready_for_pickup','shipped','cancelled','rejected'])assert.match(buyerNextStep({status,testPayment:{mode:'test',status:'paid'}}).text,/keine echte Zahlung/);
});
