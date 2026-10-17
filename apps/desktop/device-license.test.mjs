import test from 'node:test';
import assert from 'node:assert/strict';
import license from './device-license.cjs';
const now=Date.parse('2026-10-16T18:00:00Z'),validUntil=new Date(now+86400000).toISOString();
const active={ok:true,status:200,data:{active:true,validUntil}},payload={deviceKey:'a'.repeat(64)};

test('desktop restart checks an existing device without requiring owner activation',async()=>{
 const calls=[];
 const result=await license.requestDeviceLicense({now,payload,request:async(endpoint,body)=>{calls.push(endpoint);assert.equal(body,payload);return active;}});
 assert.equal(result.active,true);assert.deepEqual(calls,['/api/v1/license/device/check']);
});
test('only an explicit initial activation signal can activate an unbound device',async()=>{
 const calls=[];
 const result=await license.requestDeviceLicense({now,payload,request:async endpoint=>{
  calls.push(endpoint);return calls.length===1?{ok:false,status:409,data:{active:false,activationRequired:true}}:active;
 }});
 assert.equal(result.active,true);assert.deepEqual(calls,['/api/v1/license/device/check','/api/v1/license/device/activate']);
});
test('revoked devices and authentication denials never reactivate or trust an active flag',async()=>{
 for(const status of [401,402,403,409]){
  let calls=0;
  const result=await license.requestDeviceLicense({now,payload,request:async()=>{calls++;return {ok:false,status,data:{active:status===403,activationRequired:false,error:'denied'}};}});
  assert.equal(result.active,false);assert.equal(calls,1);
  const state={licenseValidUntil:validUntil,...license.licenseStatePatch(result,now)};
  assert.equal(license.cachedLicenseResult(state,now).active,false);
 }
});
test('an explicit inactive response clears cached permission even with HTTP success',async()=>{
 const result=await license.requestDeviceLicense({now,payload,request:async()=>({ok:true,status:200,data:{active:false}})});
 assert.equal(result.active,false);assert.equal(license.licenseStatePatch(result,now).licenseValidUntil,null);
});
test('temporary service failure may use a valid cache but cannot undo a stored denial',async()=>{
 await assert.rejects(license.requestDeviceLicense({now,payload,request:async()=>({ok:false,status:503})}),/Lizenzdienst/);
 assert.equal(license.cachedLicenseResult({licenseValidUntil:validUntil},now).active,true);
 assert.equal(license.cachedLicenseResult({licenseValidUntil:validUntil,licenseDenied:true},now).active,false);
 const refreshed=license.licenseStatePatch(active.data,now);
 assert.equal(license.cachedLicenseResult({...refreshed,licenseDenied:false},now).active,true);
});
test('malformed and excessive leases cannot become cached device permission',async()=>{
 for(const expiry of ['invalid',new Date(now-1000).toISOString(),new Date(now+32*86400000).toISOString()]){
  await assert.rejects(license.requestDeviceLicense({now,payload,request:async()=>({ok:true,status:200,data:{active:true,validUntil:expiry}})}),/Lizenzdienst/);
  assert.equal(license.cachedLicenseResult({licenseValidUntil:expiry},now).active,false);
 }
 assert.equal(await license.requestDeviceLicense({now,payload,request:async()=>({noToken:true})}),null);
});
test('native update navigation allows HTTPS and rejects executable schemes or embedded credentials',()=>{
 const base='https://bringness.de/pos/';
 assert.equal(license.externalHttpsUrl('/preise/',base),'https://bringness.de/preise/');
 assert.equal(license.externalHttpsUrl('https://bringness.com/download',base),'https://bringness.com/download');
 for(const target of ['javascript:alert(1)','file:///tmp/a','http://example.test','https://user:secret@example.test'])assert.equal(license.externalHttpsUrl(target,base),null);
});
test('native maintenance refuses empty, foreign and insecure page origins',()=>{
 const base='https://bringness.de/pos/';
 assert.equal(license.trustedPosUrl('https://bringness.de/pos/?desktop=1',base),true);
 for(const target of ['',null,'about:blank','file:///offline.html','http://bringness.de/pos/','https://bringness.de.evil.test/','https://bringness.de:444/pos/','https://user@bringness.de/pos/'])assert.equal(license.trustedPosUrl(target,base),false);
});
test('overlapping maintenance ticks share one operation and recover after rejection',async()=>{
 let calls=0,release;const gate=new Promise(resolve=>{release=resolve});
 const run=license.singleFlight(async()=>{calls++;await gate;if(calls===1)throw Error('window closed');return 'recovered';});
 const first=run(),second=run();assert.equal(first,second);
 release();await assert.rejects(first,/window closed/);assert.equal(calls,1);
 assert.equal(await run(),'recovered');assert.equal(calls,2);
});
