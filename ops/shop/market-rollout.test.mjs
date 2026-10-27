import test from 'node:test';
import assert from 'node:assert/strict';
import {marketplaceEnabled} from '../../server/shop-marketplace-rollout.js';

test('public release enables only the canonical production POS installation', () => {
  const env = {NODE_ENV:'production', PUBLIC_BASE_URL:'https://bringness.de'};
  assert.equal(marketplaceEnabled(env, 'pos'), true);
  for (const mode of ['ai','combined']) assert.equal(marketplaceEnabled(env, mode), false);
  assert.equal(marketplaceEnabled({...env,NODE_ENV:'test'}, 'pos'), false);
  assert.equal(marketplaceEnabled({...env,PUBLIC_BASE_URL:'https://example.test'}, 'pos'), false);
  assert.equal(marketplaceEnabled({}, 'pos'), false);
});

test('explicit deployment override retains an immediate kill switch', () => {
  const env = {NODE_ENV:'production',PUBLIC_BASE_URL:'https://bringness.de'};
  for (const value of ['false','','TRUE','invalid']) {
    assert.equal(marketplaceEnabled({...env,SHOP_MARKETPLACE_ENABLED:value}, 'pos'), false);
  }
  assert.equal(marketplaceEnabled({SHOP_MARKETPLACE_ENABLED:'true'}, 'pos'), true);
  assert.equal(marketplaceEnabled({SHOP_MARKETPLACE_ENABLED:'true'}, 'ai'), false);
});
