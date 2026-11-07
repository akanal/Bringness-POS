import test from 'node:test';
import assert from 'node:assert/strict';
import {base32,decode32,totp,verifyTotp,mfaCipher,newRecovery,recoveryCode,recoveryHash} from './owner-mfa-crypto.js';
test('TOTP matches RFC6238 SHA1 vectors, six digits, skew window and replay cutoff',()=>{
 const secret=base32(Buffer.from('12345678901234567890'));assert.equal(decode32(secret).toString(),'12345678901234567890');
 for(const [seconds,expected] of [[59,'94287082'],[1111111109,'07081804'],[1111111111,'14050471'],[1234567890,'89005924'],[2000000000,'69279037'],[20000000000,'65353130']])assert.equal(totp(secret,Math.floor(seconds/30),{digits:8}),expected);
 assert.equal(verifyTotp(secret,'287082',-1,59000),1);assert.equal(verifyTotp(secret,'287082',1,59000),null);assert.equal(verifyTotp(secret,287082,-1,59000),null);
 assert.equal(verifyTotp(secret,'287082',-1,89000),1);assert.equal(verifyTotp(secret,'287082',-1,120000),null);
});
test('enrollment encryption is randomized, authenticated and bound to the immutable user',()=>{
 assert.equal(mfaCipher(''),null);const cipher=mfaCipher('synthetic-stable-private-material'),secret='SYNTHETIC';const a=cipher.seal(secret,'owner'),b=cipher.seal(secret,'owner');assert.notEqual(a,b);assert(!a.includes(secret));assert.equal(cipher.open(a,'owner'),secret);assert.throws(()=>cipher.open(a,'other'));assert.throws(()=>mfaCipher('another-key').open(a,'owner'));const parts=a.split('.');parts[3]=Buffer.from('changed').toString('base64url');assert.throws(()=>cipher.open(parts.join('.'),'owner'));
});
test('recovery codes have independent random 128 bit values and only identity-bound hashes are persisted',()=>{
 const {codes,hashes}=newRecovery('owner');assert.equal(codes.length,10);assert.equal(new Set(codes).size,10);assert.equal(new Set(hashes).size,10);for(let i=0;i<10;i++){assert.match(codes[i],/^(?:[a-f0-9]{4}-){7}[a-f0-9]{4}$/);assert.equal(recoveryCode(codes[i].toUpperCase()),codes[i].replaceAll('-',''));assert.equal(recoveryHash('owner',codes[i]),hashes[i]);assert.notEqual(recoveryHash('other',codes[i]),hashes[i]);assert(!hashes.includes(codes[i]))}assert.equal(recoveryCode('bad'),null)
});
