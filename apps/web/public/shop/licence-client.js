import {validLicenceOverview} from './licence-state.js';
const error=code=>Object.assign(Error(code),{code});
export async function readLicenceOverview({token,signal,fetcher=globalThis.fetch}){
 if(typeof token!=='string'||!token||token.length>512||/\s/.test(token))throw error('UNAUTHORIZED');
 let response,value;try{response=await fetcher('/api/v1/shop/licenses',{method:'GET',headers:{Authorization:'Bearer '+token},mode:'same-origin',credentials:'omit',redirect:'error',cache:'no-store',signal});value=await response.json();}catch{throw error('SHOP_UNAVAILABLE');}
 if(!response.ok)throw error(typeof value?.code==='string'&&/^[A-Z_]{1,50}$/.test(value.code)?value.code:'SHOP_UNAVAILABLE');if(!validLicenceOverview(value))throw error('INVALID_RESPONSE');return value;
}
