// Retry only the SMTP handshake. A message is submitted once, never retried after DATA.
export async function connectSmtp({env=process.env,createTransport}={}){
 const port=Number(env.SMTP_PORT||587);
 if(!['SMTP_HOST','SMTP_USER','SMTP_PASSWORD','SMTP_FROM'].every(key=>env[key])||!Number.isInteger(port)||port<1||port>65535)throw Object.assign(Error('SMTP-Konfiguration unvollständig'),{code:'ECONFIG'});
 const factory=createTransport||(await import('nodemailer')).default.createTransport;
 const ports=env.SMTP_HOST.trim().toLowerCase()==='smtp-relay.brevo.com'&&port===587?[587,2525]:[port];
 for(let index=0;index<ports.length;index++){
  const current=ports[index];const transport=factory({host:env.SMTP_HOST,port:current,secure:current===465,requireTLS:current!==465,auth:{user:env.SMTP_USER,pass:env.SMTP_PASSWORD},tls:{rejectUnauthorized:true},connectionTimeout:7000,greetingTimeout:7000,socketTimeout:10000});
  try{await transport.verify();return transport}catch(error){transport.close();if(index===ports.length-1||!['ETIMEDOUT','ECONNECTION','ECONNREFUSED','ESOCKET'].includes(error?.code))throw error}
 }
}
export async function sendSmtpMail(message,options){const transport=await connectSmtp(options);try{return await transport.sendMail(message)}finally{transport.close()}}
