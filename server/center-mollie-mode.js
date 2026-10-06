export function molliePaymentMode(env=process.env){
 const mode=env.CENTER_MOLLIE_MODE||'test';
 if(!['test','live'].includes(mode))throw Error('INVALID_MOLLIE_MODE');
 return mode;
}
export function molliePaymentReadUrl(path,mode){
 if(!['test','live'].includes(mode))throw Error('INVALID_MOLLIE_MODE');
 const url=new URL(path,'https://api.mollie.com');
 if(url.origin!=='https://api.mollie.com'||!/^\/v2\/payments(?:\/tr_[a-zA-Z0-9]+)?$/.test(url.pathname))throw Error('INVALID_PAYMENT_URL');
 if(mode==='test')url.searchParams.set('testmode','true');
 else url.searchParams.delete('testmode');
 return url;
}
