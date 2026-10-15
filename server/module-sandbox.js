import {planModuleBasket} from './module-checkout.js';

// Pure test-only simulation. No database writes, Mollie calls or entitlement grants.
// Never expose this function as a production payment or activation endpoint.
export function simulateModulePurchase(state, {paymentOutcome='paid'}={}) {
  const quote=planModuleBasket(state);
  if (quote.unpricedModules.length) return {status:'blocked',reason:'UNPRICED_MODULES',quote,grantAccess:false};
  if (!['paid','failed','canceled','pending'].includes(paymentOutcome)) throw new Error('INVALID_TEST_OUTCOME');
  return {status:paymentOutcome,quote,simulated:true,grantAccess:false,
    eligibleForSimulatedActivation:paymentOutcome==='paid'};
}
