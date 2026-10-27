// Owner-authorized public release, 2026-10-27. Other installations stay opt-in.
export function marketplaceEnabled(env, mode) {
  if (mode === 'ai') return false;
  if (env.SHOP_MARKETPLACE_ENABLED !== undefined) {
    return env.SHOP_MARKETPLACE_ENABLED === 'true';
  }
  return mode === 'pos' && env.NODE_ENV === 'production' &&
    env.PUBLIC_BASE_URL === 'https://bringness.de';
}
