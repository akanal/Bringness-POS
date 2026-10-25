// Syntax preflight only. This neither verifies ownership nor guarantees delivery.
export function validShopBuyerEmail(email){return typeof email==='string'&&email.length<=254&&!/[\s\u0000-\u001f\u007f]/u.test(email)&&/^[^\s@\u0000-\u001f\u007f]+@[^\s@\u0000-\u001f\u007f]+$/u.test(email);}
export function validShopBuyerName(name){return name==null||(typeof name==='string'&&name.length<=500&&!/[\u0000-\u001f\u007f]/.test(name));}
