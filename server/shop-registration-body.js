import {readShopRequestBody} from './shop-request-body.js';
// Preserve registration-specific error codes and limits for existing callers.
export function readRegistrationBody(req,{timeoutMs=15000,maxBytes=16384}={}){
 if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>60000)throw TypeError('INVALID_REGISTRATION_BODY_TIMEOUT');
 return readShopRequestBody(req,{timeoutMs,maxBytes}).catch(error=>{
  if(error.code==='SHOP_BODY_TIMEOUT')throw Object.assign(Error('REGISTRATION_BODY_TIMEOUT'),{code:'REGISTRATION_BODY_TIMEOUT'});
  throw error;
 });
}
