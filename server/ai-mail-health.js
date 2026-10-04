// No messages are sent by this diagnostic. Never return credentials or server responses.
export function mailConfigurationStatus(env=process.env){
 const missing=['SMTP_HOST','SMTP_USER','SMTP_PASSWORD','SMTP_FROM'].filter(key=>!env[key]);
 if(missing.length)return {available:false,status:'configuration_missing'};
 const port=Number(env.SMTP_PORT||587);if(!Number.isInteger(port)||port<1||port>65535)return {available:false,status:'configuration_invalid'};
 try{if(new URL(env.AI_PUBLIC_BASE_URL||env.PUBLIC_BASE_URL||'').protocol!=='https:')return {available:false,status:'confirmation_url_invalid'};}catch{return {available:false,status:'confirmation_url_invalid'};}
 return null;
}
export function mailFailureStatus(error){return {available:false,status:error?.code==='EAUTH'?'authentication_failed':['ETIMEDOUT','ECONNECTION','ECONNREFUSED','EDNS','ESOCKET'].includes(error?.code)?'connection_failed':'verification_failed'};}
export function createMailProbe({env=process.env,createTransport,now=Date.now}={}){
 let current=null,checked=0,pending=null;
 return async()=>{
  const config=mailConfigurationStatus(env);if(config)return config;
  if(current&&now()-checked<60000)return current;if(pending)return pending;
  pending=(async()=>{let transport;try{const factory=createTransport||(await import('nodemailer')).default.createTransport;
   const port=Number(env.SMTP_PORT||587);transport=factory({host:env.SMTP_HOST,port,secure:port===465,requireTLS:port!==465,auth:{user:env.SMTP_USER,pass:env.SMTP_PASSWORD},tls:{rejectUnauthorized:true},connectionTimeout:7000,greetingTimeout:7000,socketTimeout:7000});
   await transport.verify();current={available:true,status:'ready'};
  }catch(error){current=mailFailureStatus(error);}finally{transport?.close();checked=now();pending=null;}return current;})();
  return pending;
 };
}
export const registrationMailStatus=createMailProbe();
