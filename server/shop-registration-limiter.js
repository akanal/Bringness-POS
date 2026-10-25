// Process-local admission limits, not a distributed edge-abuse service.
export function createShopRegistrationLimiter({limit=5,windowMs=900000,maxKeys=5000,globalLimit=30,globalWindowMs=60000,now=Date.now}={}){
 if(![limit,windowMs,maxKeys,globalLimit,globalWindowMs].every(n=>Number.isSafeInteger(n)&&n>0)||typeof now!=='function')throw TypeError('INVALID_REGISTRATION_LIMIT');
 const entries=new Map();let global={count:0,until:0};
 return {admit(key){const at=now();if(global.until<=at)global={count:0,until:at+globalWindowMs};let entry=entries.get(key);if(entry?.until<=at){entries.delete(key);entry=null;}
  if(global.count>=globalLimit)return {allowed:false,retryAfter:Math.max(1,Math.ceil((global.until-at)/1000))};
  if(entry?.count>=limit)return {allowed:false,retryAfter:Math.max(1,Math.ceil((entry.until-at)/1000))};
  if(!entry&&entries.size>=maxKeys){for(const [id,old] of entries)if(old.until<=at)entries.delete(id);if(entries.size>=maxKeys)return {allowed:false,retryAfter:Math.max(1,Math.ceil(windowMs/1000))};}
  entry??={count:0,until:at+windowMs};entry.count++;entries.set(key,entry);global.count++;return {allowed:true};
 }};
}
