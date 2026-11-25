import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {test} from 'node:test';
import {deliverySandboxConfig} from '../server/delivery-sandbox.js';

async function renderSandboxCompose(overrides = {}) {
  const source = await readFile(new URL('./delivery-sandbox.compose.json',import.meta.url),'utf8');
  const values = {
    DELIVERY_SANDBOX_ORIGIN:'https://sandbox-bestellen.example.test',
    DELIVERY_SANDBOX_RESTAURANT_ID:'00000000-0000-0000-0000-000000000001',
    ...overrides
  };
  return JSON.parse(source
    .replace(/\$\{([A-Z_]+):\?required\}/g, (_match, key) => values[key] ?? 'test-placeholder')
    .replace(/\$\{([A-Z_]+):-([^}]+)\}/g, (_match, key, fallback) => values[key] || fallback));
}

test('sandbox compose renders separate staging settings accepted by runtime policy',async()=>{
  const compose = await renderSandboxCompose();
  assert.equal(compose.services.database.ports,undefined);
  assert.equal(compose.networks.database.internal,true);
  assert.deepEqual(compose.services.database.networks,['database']);
  assert.deepEqual(compose.services.app.ports,['127.0.0.1:3017:3000']);
  assert.match(compose.services.app.healthcheck.test.at(-1),/BRINGNESS_DELIVERY_SANDBOX_ORIGIN/);
  assert.match(compose.services.app.healthcheck.test.at(-1),/headers:\{host\}/);
  assert.equal(compose.services.app.environment.CENTER_MOLLIE_MODE,'test');
  assert.equal(compose.services.app.environment.BRINGNESS_DELIVERY_LIVE_CHECKOUT,'false');
  assert.equal(deliverySandboxConfig(compose.services.app.environment).origin,'https://sandbox-bestellen.example.test');
});

test('Mollie refund consent is disabled by default in sandbox compose', async () => {
  const compose = await renderSandboxCompose();
  assert.equal(compose.services.app.environment.BRINGNESS_DELIVERY_SANDBOX_REFUNDS, 'false');
});

test('Mollie refund consent opt-in stays in the isolated test deployment', async () => {
  const compose = await renderSandboxCompose({DELIVERY_SANDBOX_MOLLIE_REFUNDS: 'true'});
  const env = compose.services.app.environment;

  assert.equal(env.BRINGNESS_DELIVERY_SANDBOX_REFUNDS, 'true');
  assert.equal(env.CENTER_MOLLIE_MODE, 'test');
  assert.equal(env.BRINGNESS_DELIVERY_LIVE_CHECKOUT, 'false');
  assert.equal(deliverySandboxConfig(env).restaurantId, env.BRINGNESS_DELIVERY_SANDBOX_RESTAURANT_ID);
  assert.equal(compose.services.database.environment.BRINGNESS_DELIVERY_SANDBOX_REFUNDS, undefined);
});
