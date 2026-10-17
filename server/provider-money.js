// Provider values are decimal strings, never floating-point or coerced inputs.
export function providerEuroCents(amount){
 if(!amount||amount.currency!=='EUR'||typeof amount.value!=='string'||amount.value.length>20||!/^\d+\.\d{2}$/.test(amount.value))throw Error('INVALID_EUR_AMOUNT');
 const cents=BigInt(amount.value.replace('.',''));if(cents>BigInt(Number.MAX_SAFE_INTEGER))throw Error('INVALID_EUR_AMOUNT');return Number(cents);
}
