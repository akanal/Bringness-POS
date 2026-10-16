const unavailable=()=>Error('Lizenzdienst momentan nicht erreichbar.');
exports.requestDeviceLicense=async({request,payload,now=Date.now()})=>{
 let reply=await request('/api/v1/license/device/check',payload);
 if(reply?.noToken)return null;
 // Only the server's explicit initial-activation signal permits this fallback.
 // A disabled or revoked device must not reactivate itself during recovery.
 if(reply?.status===409&&reply.data?.active===false&&reply.data.activationRequired===true){
  reply=await request('/api/v1/license/device/activate',payload);
 }
 if(reply?.noToken)return null;
 if(!reply||reply.status>=500)throw unavailable();
 if(!reply.ok)return {active:false,error:typeof reply.data?.error==='string'?reply.data.error:'Gerätefreigabe abgelehnt.'};
 if(reply.data?.active===false)return {active:false,error:typeof reply.data.error==='string'?reply.data.error:'Gerätefreigabe abgelehnt.'};
 const data=reply.data,expiry=typeof data?.validUntil==='string'?Date.parse(data.validUntil):NaN;
 if(data?.active!==true||!Number.isFinite(expiry)||expiry<=now||expiry>now+31*86400000)throw unavailable();
 return data;
};
exports.licenseStatePatch=(result,now=Date.now())=>result?.active===true?
 {licenseValidUntil:result.validUntil,licenseDenied:false,lastLicenseCheckAt:new Date(now).toISOString()}:
 {licenseValidUntil:null,licenseDenied:true,lastLicenseCheckAt:new Date(now).toISOString()};
exports.cachedLicenseResult=(state,now=Date.now())=>{
 const until=typeof state?.licenseValidUntil==='string'?Date.parse(state.licenseValidUntil):NaN;
 if(state?.licenseDenied!==true&&Number.isFinite(until)&&until>=now&&until<=now+31*86400000)return {active:true,offline:true,validUntil:state.licenseValidUntil};
 return {active:false,offline:true,error:'Die Lizenz konnte längere Zeit nicht mit Bringness geprüft werden. Bitte stellen Sie kurz eine Internetverbindung her.'};
};
exports.externalHttpsUrl=(target,base)=>{
 try{const url=new URL(target,base);return url.protocol==='https:'&&!url.username&&!url.password?url.href:null}catch{return null}
};
exports.trustedPosUrl=(target,base)=>{
 try{const url=new URL(target);return url.protocol==='https:'&&url.origin===new URL(base).origin&&!url.username&&!url.password}catch{return false}
};
exports.singleFlight=run=>{
 let running=null;
 return (...args)=>{
  if(running)return running;
  running=Promise.resolve().then(()=>run(...args)).finally(()=>{running=null});
  return running;
 };
};
