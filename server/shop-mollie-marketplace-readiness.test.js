import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {marketplaceReadinessReport} from './shop-mollie-marketplace-readiness.js';

const fixture = () => ({config: {publicOrigin: 'https://private-marker.test', clientId: 'app_privateMarker',
  clientSecret: 'private_marker_secret', tokenKey: 'ab'.repeat(32)}, registration: {
  callbackUrl: 'https://private-marker.test/api/v1/shop/marketplace/merchant-callback',
  returnUrl: 'https://private-marker.test/shop/marketplace-payment-return.html',
  webhookUrl: 'https://private-marker.test/api/v1/shop/marketplace/checkout-notification'
}});
const cli = fileURLToPath(new URL('../ops/shop/marketplace-readiness.mjs', import.meta.url));
function run(input, args = [], env = {}) {
  const child = spawnSync(process.execPath, [cli, ...args], {input, encoding: 'utf8', timeout: 5000,
    env: {...process.env, ...env}});
  assert.ifError(child.error);
  assert.equal(child.stderr, '');
  return {code: child.status, report: JSON.parse(child.stdout), raw: child.stdout};
}
test('readiness gives independent local checks and no production permission or submitted values', () => {
  const input = fixture(), before = structuredClone(input), r = marketplaceReadinessReport(input);
  assert.equal(r.status, 'local_checks_passed');
  assert.equal(r.checks.length, 8);
  assert.equal(r.unverifiedPrerequisites.length, 7);
  for (const key of ['providerVerified', 'merchantAccepted', 'productionReady', 'canPay', 'canFulfil']) assert.equal(r[key], false);
  for (const v of [...Object.values(input.config), ...Object.values(input.registration)]) assert.ok(!JSON.stringify(r).includes(v));
  assert.deepEqual(input, before);
});
test('missing credentials and each endpoint mismatch independently fail local checks', () => {
  for (const key of Object.keys(fixture().config)) {
    const input = fixture(); delete input.config[key];
    const r = marketplaceReadinessReport(input);
    assert.equal(r.status, 'local_checks_failed'); assert.equal(r.configurationValid, false);
  }
  for (const key of Object.keys(fixture().registration)) {
    const input = fixture(); input.registration[key] += '?private=secret';
    const r = marketplaceReadinessReport(input);
    assert.equal(r.configurationValid, true); assert.equal(r.registrationMatches, false);
    assert.ok(!JSON.stringify(r).includes('secret'));
  }
});
test('schema rejects arrays, primitive values, extra fields and forged acceptance', () => {
  for (const input of [null, [], true, '', {}, {config: [], registration: {}},
    {...fixture(), productionReady: true}, {...fixture(), config: {...fixture().config, fetcher: 'secret'}},
    {...fixture(), config: {...fixture().config, tokenKey: 123}},
    {...fixture(), registration: {...fixture().registration, private_secret: 'secret'}},
    JSON.parse('{"__proto__":{"productionReady":true}}')]) {
    const r = marketplaceReadinessReport(input);
    assert.equal(r.status, 'invalid_input'); assert.equal(r.errorCode, 'INPUT_SCHEMA');
    assert.equal(r.canPay, false); assert.equal(r.productionReady, false);
    assert.ok(!JSON.stringify(r).includes('private_secret'));
  }
});
test('CLI returns a bounded sanitized JSON report and meaningful exit codes', () => {
  const success = run(JSON.stringify(fixture())); assert.equal(success.code, 0);
  assert.equal(success.report.status, 'local_checks_passed'); assert.equal(success.report.productionReady, false);
  const failed = run('{"config":{},"registration":{}}'); assert.equal(failed.code, 2);
  assert.equal(failed.report.status, 'local_checks_failed');
  for (const input of ['', '{private_secret', 'null', '[]', '{"productionReady":true}']) {
    const failed = run(input); assert.equal(failed.code, 1); assert.equal(failed.report.status, 'invalid_input');
    assert.ok(!failed.raw.includes('private_secret'));
  }
});
test('CLI rejects oversize, invalid UTF-8 and arguments without reflecting data', () => {
  const cases = [run('private_secret'.repeat(2000)), run(Buffer.from([0xff, 0xfe])), run('', ['private_secret'])];
  assert.deepEqual(cases.map(r => r.report.errorCode), ['INPUT_TOO_LARGE', 'INPUT_READ', 'ARGUMENTS_NOT_ALLOWED']);
  for (const r of cases) { assert.equal(r.code, 1); assert.ok(!r.raw.includes('private_secret')); }
});
test('CLI ignores environment credentials and never upgrades an empty configuration', () => {
  const r = run('{"config":{},"registration":{}}', [], {MOLLIE_CLIENT_SECRET: 'private_secret', SHOP_MARKETPLACE_ENABLED: 'true'});
  assert.equal(r.code, 2); assert.equal(r.report.canPay, false); assert.equal(r.report.configurationValid, false);
  assert.ok(!r.raw.includes('private_secret'));
});
