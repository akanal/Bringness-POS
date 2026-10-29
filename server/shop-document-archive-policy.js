import {createHash} from 'node:crypto';
// Isolated integrity primitive, not a substitute for retention-compliant storage.
function canonical(value){
 if(value===null||typeof value==='string'||typeof value==='boolean')return JSON.stringify(value);
 if(typeof value==='number'){if(!Number.isFinite(value)||!Number.isSafeInteger(value))throw Error('SHOP_ARCHIVE_NUMBER_INVALID');return JSON.stringify(value);}
 if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
 if(value&&typeof value==='object'&&Object.getPrototypeOf(value)===Object.prototype){
  const keys=Object.keys(value).sort();
  if(keys.some(k=>['__proto__','constructor','prototype'].includes(k)))throw Error('SHOP_ARCHIVE_KEY_INVALID');
  return '{'+keys.map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';
 }
 throw Error('SHOP_ARCHIVE_VALUE_INVALID');
}
export function digestShopDocument(document){
 if(!document||typeof document!=='object'||Array.isArray(document))throw Error('SHOP_ARCHIVE_DOCUMENT_INVALID');
 const payload=canonical(document);
 return Object.freeze({algorithm:'sha256',digest:createHash('sha256').update(payload,'utf8').digest('hex')});
}
export function verifyShopDocumentDigest(document,expected){
 if(!expected||expected.algorithm!=='sha256'||typeof expected.digest!=='string'||!/^[a-f0-9]{64}$/.test(expected.digest))throw Error('SHOP_ARCHIVE_DIGEST_INVALID');
 return digestShopDocument(document).digest===expected.digest;
}
