import {uuid} from './shop-drafts.js';
import {shopError} from './shop-account.js';
// A checkout UUID is a reference, never a payment proof or authentication token.
// Query form is compatible with the existing provider return-URL contract; the
// landing page validates it and immediately converts it to a local fragment.
export function shopPaymentReturnUrl(publicOrigin,id){
 if(!uuid(id))throw shopError('INVALID_REQUEST');let u;try{u=new URL(publicOrigin);if(u.protocol!=='https:'||u.origin!==publicOrigin||u.username||u.password||u.port)throw Error();}catch{throw shopError('INVALID_PUBLIC_ORIGIN');}
 return u.origin+'/shop/payment-return.html?checkout='+id.toLowerCase();
}
