import {billingPolicy} from './billing-policy.js';

// Pure checkout planning: no entitlement is granted until payment is verified.
export function planModuleCheckout({base=false,download=false,baseAccess=base,restaurant=false,tableQr=false,requestedModule}={}) {
  const policy=billingPolicy({base,download,baseAccess,restaurant,tableQr});
  const options={
    restaurant_monthly:{amountNetCents:null,items:['restaurant_monthly']},
    table_qr_monthly:{amountNetCents:3989,items:['table_qr_monthly','table_management_monthly']}
  };
  if(!Object.hasOwn(options,requestedModule)) throw new Error('UNKNOWN_MODULE');
  if(!policy.features.pos_base) throw new Error('BASE_LICENSE_REQUIRED');
  if(policy.plans[requestedModule].active) throw new Error('MODULE_ALREADY_ACTIVE');
  if(!policy.plans[requestedModule].eligible) throw new Error('MODULE_NOT_ELIGIBLE');
  return {module:requestedModule,...options[requestedModule],currency:'EUR',grantAccess:false,requiresVerifiedPayment:true};
}

// A webhook's payload alone is never sufficient evidence of payment.
export function mayActivateModule({verifiedPayment=false,paymentStatus,subscriptionActive=false}={}) {
  return verifiedPayment===true && paymentStatus==='paid' && subscriptionActive===true;
}
