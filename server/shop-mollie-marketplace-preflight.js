// Pure structural checks only. Never contacts a provider, reads environment values,
// decrypts merchant tokens, starts workers or grants production permission.
export function marketplaceTestPreflight(config = {}, registration = {}) {
  const checks = [];
  const add = (code, ok) => checks.push({code, ok: ok === true});
  let origin = null;
  try {
    const u = new URL(config.publicOrigin);
    if (u.protocol === 'https:' && u.origin === config.publicOrigin && !u.username && !u.password) origin = u.origin;
  } catch {}
  add('HTTPS_ORIGIN', origin !== null);
  add('OAUTH_CLIENT_ID', typeof config.clientId === 'string' && /^app_[A-Za-z0-9]{1,100}$/.test(config.clientId));
  add('OAUTH_CLIENT_SECRET', typeof config.clientSecret === 'string' && config.clientSecret.length >= 10 && config.clientSecret.length <= 4096 && !/\s/.test(config.clientSecret));
  add('TOKEN_ENCRYPTION_KEY', typeof config.tokenKey === 'string' && /^[a-f0-9]{64}$/i.test(config.tokenKey));
  add('HTTP_TRANSPORT', config.fetcher === undefined || typeof config.fetcher === 'function');
  const expected = origin ? {
    callbackUrl: origin + '/api/v1/shop/marketplace/merchant-callback',
    returnUrl: origin + '/shop/marketplace-payment-return.html',
    webhookUrl: origin + '/api/v1/shop/marketplace/checkout-notification'
  } : null;
  // Values supplied by an operator are a comparison, not remote verification.
  for (const [key, code] of [['callbackUrl','CALLBACK_MATCH'], ['returnUrl','RETURN_MATCH'], ['webhookUrl','WEBHOOK_MATCH']]) {
    add(code, expected !== null && registration[key] === expected[key]);
  }
  return {
    paymentMode: 'test', configurationValid: checks.slice(0,5).every(c => c.ok),
    registrationMatches: checks.slice(5).every(c => c.ok), checks,
    // No supplied flag or structural success may turn these into acceptance.
    providerVerified: false, merchantAccepted: false, productionReady: false,
    canPay: false, canFulfil: false,
    expected
  };
}
