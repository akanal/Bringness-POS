const fail=code=>Object.assign(Error(code),{code});
export function validShopLogin(email,password){return typeof email==='string'&&email.trim().length<=254&&/^[^\s@]+@[^\s@]+$/u.test(email.trim())&&!/[\u0000-\u001f\u007f]/.test(email)&&typeof password==='string'&&password.length>0&&password.length<=128;}
export function shopLoginDestination(hash=''){return hash==='#marketplace'?'/shop/marketplace.html#my-market-orders':hash==='#merchant'?'/shop/marketplace-seller.html':hash==='#review'?'/shop/#review':hash==='#licences'?'/shop/licences.html':'/shop/';}
export async function requestShopLogin({email,password,fetcher=fetch,signal}){
 if(!validShopLogin(email,password))throw fail('INVALID_INPUT');
 try{
  const response=await fetcher('/api/v1/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:email.trim().toLowerCase(),password}),credentials:'omit',mode:'same-origin',cache:'no-store',redirect:'error',signal});
  if(!response.ok)throw fail(response.status===401?'INVALID_CREDENTIALS':response.status===429?'LOGIN_LIMIT':'LOGIN_UNAVAILABLE');
  const result=await response.json();
  if(typeof result?.token!=='string'||!/^[a-f0-9]{64}$/.test(result.token)||typeof result.user?.role!=='string')throw fail('LOGIN_UNAVAILABLE');
  if(!['owner','admin'].includes(result.user.role))throw fail('SHOP_ACCOUNT_REQUIRED');
  return {token:result.token};
 }catch(e){if(['INVALID_INPUT','INVALID_CREDENTIALS','LOGIN_LIMIT','LOGIN_UNAVAILABLE','SHOP_ACCOUNT_REQUIRED'].includes(e.code))throw e;throw fail('LOGIN_UNAVAILABLE');}
}
