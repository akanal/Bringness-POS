import assert from 'node:assert/strict';
import {test} from 'node:test';
import {deliverySandboxConfig} from './delivery-sandbox.js';

const restaurantId = '00000000-0000-0000-0000-000000000001';
const origin = 'https://sandbox-bestellen.example.test';
const env = {
  BRINGNESS_DELIVERY_SANDBOX:'true',
  BRINGNESS_DELIVERY_SANDBOX_ORIGIN:origin,
  BRINGNESS_DELIVERY_SANDBOX_RESTAURANT_ID:restaurantId,
  DATABASE_URL:'postgres://example.invalid/bringness_bestellen_sandbox'
};

test('Mollie sandbox requires its own HTTPS host, database and restaurant',()=>{
  assert.equal(deliverySandboxConfig({}),null);
  assert.deepEqual(deliverySandboxConfig(env),{origin,restaurantId});
  for (const invalid of [
    {BRINGNESS_PREVIEW_MODE:'isolated'},
    {BRINGNESS_DELIVERY_LIVE_CHECKOUT:'true'},
    {CENTER_MOLLIE_MODE:'live'},
    {PUBLIC_BASE_URL:'https://bringness.de'},
    {CENTER_MOLLIE_REDIRECT_URI:'https://bringness.de/api/v1/centers/mollie/callback'},
    {BRINGNESS_DELIVERY_SANDBOX_ORIGIN:'https://bringness.de'},
    {BRINGNESS_DELIVERY_SANDBOX_ORIGIN:origin+'/bestellen'},
    {BRINGNESS_DELIVERY_SANDBOX_RESTAURANT_ID:''},
    {DATABASE_URL:'postgres://example.invalid/bringness'}
  ]) assert.throws(()=>deliverySandboxConfig({...env,...invalid}),/INVALID_DELIVERY_SANDBOX_CONFIGURATION/);
});

test('active Center sandbox checkout must return to the isolated sandbox', () => {
  const checkout = {...env, CENTER_CHECKOUT_ENABLED: 'true', CENTER_MOLLIE_MODE: 'test'};
  assert.throws(() => deliverySandboxConfig(checkout), /INVALID_DELIVERY_SANDBOX_CONFIGURATION/);
  for (const wrongOrigin of ['https://bringness.de', origin + '/bestellen', origin + '?test=1']) {
    assert.throws(
      () => deliverySandboxConfig({...checkout, CENTER_PAYMENT_ORIGIN: wrongOrigin}),
      /INVALID_DELIVERY_SANDBOX_CONFIGURATION/
    );
  }
  for (const validOrigin of [origin, origin + '/']) {
    assert.deepEqual(deliverySandboxConfig({...checkout, CENTER_PAYMENT_ORIGIN: validOrigin}), {origin, restaurantId});
  }
});
