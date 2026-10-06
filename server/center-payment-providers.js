import {beginRestaurantMollieConnect} from './center-mollie-connect.js';
export async function beginRestaurantPaymentConnect(pool,user,centerId,restaurantId,provider,env=process.env){
 if(provider!=='mollie')return {status:422,error:'Dieser Zahlungsanbieter ist noch nicht angebunden. Center-Onlinezahlungen bleiben deaktiviert.'};
 return beginRestaurantMollieConnect(pool,user,centerId,restaurantId,env);
}
