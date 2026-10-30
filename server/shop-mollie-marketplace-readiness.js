import {marketplaceTestPreflight} from './shop-mollie-marketplace-preflight.js';

const fields = {
  config: ['publicOrigin', 'clientId', 'clientSecret', 'tokenKey'],
  registration: ['callbackUrl', 'returnUrl', 'webhookUrl']
};
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);

// JSON input only. No environment lookup, provider/database access or host mutation.
// A fixed output vocabulary prevents submitted values or property names leaking.
export function marketplaceReadinessReport(input) {
  const schemaValid = object(input) && Object.keys(input).every(k => Object.hasOwn(fields, k)) &&
    Object.entries(fields).every(([key, allowed]) => object(input[key]) &&
      Object.keys(input[key]).every(k => allowed.includes(k) && typeof input[key][k] === 'string'));
  if (!schemaValid) return {
    schemaVersion: 1, status: 'invalid_input', errorCode: 'INPUT_SCHEMA',
    productionReady: false, canPay: false, canFulfil: false
  };
  const result = marketplaceTestPreflight(input.config, input.registration);
  return {
    schemaVersion: 1, status: result.configurationValid && result.registrationMatches ? 'local_checks_passed' : 'local_checks_failed',
    paymentMode: 'test', configurationValid: result.configurationValid,
    registrationMatches: result.registrationMatches, checks: result.checks,
    // Do not include derived URLs; even a canonical hostname is untrusted input.
    evidenceScope: 'local_structure_and_operator_supplied_addresses_only',
    providerVerified: false, merchantAccepted: false, productionReady: false,
    canPay: false, canFulfil: false,
    unverifiedPrerequisites: [
      'PROTECTED_HOST_CONFIGURATION', 'KEY_STABILITY_AND_TOKEN_DECRYPTION',
      'REMOTE_PROVIDER_REGISTRATION', 'REAL_MERCHANT_CONSENT',
      'HOST_SCHEDULER_LIFECYCLE', 'PRODUCTION_ACCOUNTING_AND_REFUNDS',
      'REAL_GOODS_AND_KITCHEN_RELEASE'
    ]
  };
}
