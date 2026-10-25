const fail=code=>Object.assign(Error(code),{code});
export async function requestShopRegistration({requestId,registration,signal,fetcher=fetch}){
 if(typeof requestId!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(requestId))throw fail('INVALID_REGISTRATION');
 try{
  const response=await fetcher('/api/v1/shop/registrations',{method:'POST',headers:{'Content-Type':'application/json; charset=utf-8'},body:JSON.stringify({requestId,registration}),credentials:'omit',mode:'same-origin',cache:'no-store',redirect:'error',signal});
  if(response.status===404)throw fail('REGISTRATION_DISABLED');
  const value=await response.json();
  if(!response.ok){const known=['INVALID_REGISTRATION','EMAIL_UNAVAILABLE','REQUEST_CONFLICT','REGISTRATION_REVIEW','REGISTRATION_LIMIT','REGISTRATION_NOT_READY','REGISTRATION_BUSY','REGISTRATION_BODY_TIMEOUT','REGISTRATION_DISABLED'];const error=fail(known.includes(value?.code)?value.code:'REGISTRATION_UNAVAILABLE');if(response.status===429&&error.code==='REGISTRATION_LIMIT'){const seconds=response.headers?.get('retry-after');if(typeof seconds==='string'&&/^[1-9][0-9]{0,2}$/.test(seconds)&&Number(seconds)<=900)error.retryAfter=Number(seconds);}throw error;}
  if(value?.version!==1||value.requestId!==requestId.toLowerCase()||value.recorded!==true||typeof value.replay!=='boolean'||value.loginRequired!==true||value.canPay!==false||value.canActivate!==false||value.checkoutConnected!==false)throw fail('REGISTRATION_UNAVAILABLE');
  return {version:1,requestId:value.requestId,recorded:true,replay:value.replay,loginRequired:true,canPay:false,canActivate:false,checkoutConnected:false};
 }catch(e){if(['INVALID_REGISTRATION','EMAIL_UNAVAILABLE','REQUEST_CONFLICT','REGISTRATION_REVIEW','REGISTRATION_LIMIT','REGISTRATION_NOT_READY','REGISTRATION_BUSY','REGISTRATION_BODY_TIMEOUT','REGISTRATION_DISABLED','REGISTRATION_UNAVAILABLE'].includes(e.code))throw e;throw fail('REGISTRATION_UNAVAILABLE');}
}
