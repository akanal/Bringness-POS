import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import {runtimeMode, loadAiFeatures, blockAiRequest} from "./runtime-mode.js";

test("POS never imports AI modules or initializes their database", async () => {
  let imported = false;
  const features = await loadAiFeatures("pos", async () => { imported = true; throw new Error("AI database unavailable"); });
  assert.equal(features, null);
  assert.equal(imported, false);
});

test("existing combined installations retain AI features", async () => {
  const expected = {handleAiPlatform() {}, migrateAiPlatform() {}};
  assert.equal(await loadAiFeatures("combined", async () => expected), expected);
  assert.equal(runtimeMode(undefined), "combined");
  assert.equal(runtimeMode(" POS "), "pos");
  assert.throws(() => runtimeMode("ai"), /dedicated AI runtime/);
  assert.throws(() => runtimeMode("typo"), /APP_MODE/);
});

test("HTTP isolation blocks AI routes and assets but preserves POS routes", async () => {
  const server = http.createServer((req, res) => {
    if (blockAiRequest(req, res, "pos")) return;
    res.end("POS fallback");
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  try {
    const base = "http://127.0.0.1:" + server.address().port;
    for (const path of ["/api/ai", "/api/ai/orders", "/ai.html", "/ai-workspace.js?x=1", "/assets/bringness-ai-logo.svg", "/%61i.html", "/api%2fai/orders"]) {
      const response = await fetch(base + path);
      assert.equal(response.status, 404, path);
      assert.equal(response.headers.get("cache-control"), "no-store");
    }
    for (const path of ["/", "/pos/", "/service/", "/api/v1/guest/order", "/assets/bringness-pos.svg"]) {
      const response = await fetch(base + path);
      assert.equal(response.status, 200, path);
      assert.equal(await response.text(), "POS fallback");
    }
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});


const { configurePosOrigin } = await import('./runtime-mode.js');
test('production POS moves legacy public links to bringness.de and preserves other runtimes', () => {
  for (const old of ['', 'https://bringness-pos.de/', 'https://www.bringness-pos.de', 'https://bringness-pos-app-production.up.railway.app']) {
    const env = { NODE_ENV: 'production', PUBLIC_BASE_URL: old, PUBLIC_URL: old };
    configurePosOrigin(env, 'pos');
    assert.equal(env.PUBLIC_BASE_URL, 'https://bringness.de');
    assert.equal(env.PUBLIC_URL, 'https://bringness.de');
  }
  for (const [mode, nodeEnv, url] of [['combined','production','https://bringness-ai.com'], ['pos','development','http://localhost:3000'], ['pos','production','https://custom.example']]) {
    const env = { NODE_ENV: nodeEnv, PUBLIC_BASE_URL: url, PUBLIC_URL: url };
    configurePosOrigin(env, mode);
    assert.equal(env.PUBLIC_BASE_URL, url); assert.equal(env.PUBLIC_URL, url);
  }
});
