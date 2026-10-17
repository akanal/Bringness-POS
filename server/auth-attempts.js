import crypto from 'node:crypto';
export class BoundedLoginAttempts extends Map{
 constructor({maxEntries=10000,now=Date.now}={}){super();if(!Number.isInteger(maxEntries)||maxEntries<1)throw TypeError('Invalid login attempt capacity');this.maxEntries=maxEntries;this.now=now;}
 set(key,value){
  if(!this.has(key)&&this.size>=this.maxEntries){
   for(const [old,entry] of this)if(Number.isFinite(entry?.until)&&entry.until<=this.now())this.delete(old);
   // Never evict an active block: new random identities cannot flush lockouts.
   if(this.size>=this.maxEntries)throw Object.assign(Error('Zugangsprüfung ausgelastet. Bitte später erneut versuchen.'),{status:429,code:'AUTH_RATE_CAPACITY'});
  }
  return super.set(key,value);
 }
}
export const loginAttempts=new BoundedLoginAttempts();
export function clearLoginAttempts(email){loginAttempts.delete(crypto.createHash('sha256').update(String(email||'').trim().toLowerCase()).digest('hex'));}
