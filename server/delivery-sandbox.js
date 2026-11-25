import {isolatedPreview} from './preview-policy.js';

export function deliverySandboxConfig(env) {
  if (env.BRINGNESS_DELIVERY_SANDBOX!=='true') return null;
  const invalid = () => { throw Error('INVALID_DELIVERY_SANDBOX_CONFIGURATION'); };
  if (isolatedPreview(env) || env.BRINGNESS_DELIVERY_LIVE_CHECKOUT==='true' ||
      (env.CENTER_MOLLIE_MODE && env.CENTER_MOLLIE_MODE!=='test')) invalid();

  let origin, database;
  try {
    origin = new URL(env.BRINGNESS_DELIVERY_SANDBOX_ORIGIN);
    database = new URL(env.DATABASE_URL);
  } catch {
    invalid();
  }
  const restaurantId = env.BRINGNESS_DELIVERY_SANDBOX_RESTAURANT_ID;
  if (origin.protocol!=='https:' || origin.href!==origin.origin+'/' ||
      !/^sandbox[-.]/.test(origin.hostname) || origin.port ||
      !['postgres:', 'postgresql:'].includes(database.protocol) ||
      !/^\/bringness_[a-z0-9_]*sandbox$/.test(database.pathname) ||
      database.search || database.hash ||
      !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(restaurantId ?? '')) invalid();
  for (const key of ['PUBLIC_BASE_URL','PUBLIC_URL']) {
    if (env[key] && env[key].replace(/\/$/,'')!==origin.origin) invalid();
  }
  const paymentOrigin = env.CENTER_PAYMENT_ORIGIN;
  if ((paymentOrigin && paymentOrigin !== origin.origin && paymentOrigin !== origin.href) ||
      (env.CENTER_CHECKOUT_ENABLED === 'true' && !paymentOrigin)) invalid();
  if (env.CENTER_MOLLIE_REDIRECT_URI &&
      env.CENTER_MOLLIE_REDIRECT_URI!==origin.origin+'/api/v1/centers/mollie/callback') invalid();
  return {origin:origin.origin,restaurantId};
}
