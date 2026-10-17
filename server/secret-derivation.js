import crypto from 'node:crypto';
const busy=()=>Object.assign(Error('Zu viele gleichzeitige Zugangsprüfungen. Bitte kurz warten und erneut versuchen.'),{status:503,code:'AUTH_CAPACITY'});
export function createSecretDeriver({maxActive=4,maxQueued=32,derive=crypto.scrypt}={}){
 if(!Number.isInteger(maxActive)||maxActive<1||!Number.isInteger(maxQueued)||maxQueued<0)throw TypeError('Invalid secret derivation capacity');
 let active=0;const queue=[];
 const start=job=>{
  active++;
  const finish=(error,key)=>{active--;const next=queue.shift();if(next)start(next);error?job.reject(error):job.resolve(key);};
  try{derive(job.value,job.salt,64,finish);}catch(error){finish(error);}
 };
 return (value,salt)=>{
  if(typeof value!=='string'||value.length>1024||typeof salt!=='string'||!salt||salt.length>4096)return Promise.reject(Object.assign(Error('Ungültige Zugangsdaten'),{status:400,code:'INVALID_SECRET'}));
  if(active>=maxActive&&queue.length>=maxQueued)return Promise.reject(busy());
  return new Promise((resolve,reject)=>{const job={value,salt,resolve,reject};active<maxActive?start(job):queue.push(job);});
 };
}
export const deriveSecret=createSecretDeriver();
export async function legacyPasswordHash(value){return (await deriveSecret(value,process.env.PASSWORD_PEPPER||'bringness-pos')).toString('hex');}
export async function saltedSecretHash(value){const salt=crypto.randomBytes(16).toString('hex');return salt+':'+(await deriveSecret(value,salt)).toString('hex');}
export async function secretMatches(value,stored,{allowLegacy=true}={}){
 if(typeof value!=='string'||value.length>1024||typeof stored!=='string')return false;
 let salt,key;
 if(/^[a-f0-9]{32}:[a-f0-9]{128}$/i.test(stored))[salt,key]=stored.split(':');
 else if(allowLegacy&&/^[a-f0-9]{128}$/i.test(stored)){salt=process.env.PASSWORD_PEPPER||'bringness-pos';key=stored;}
 else return false;
 const actual=await deriveSecret(value,salt),expected=Buffer.from(key,'hex');return crypto.timingSafeEqual(actual,expected);
}
