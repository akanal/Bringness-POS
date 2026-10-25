import {test} from 'node:test';import assert from 'node:assert/strict';
import {requestShopRegistration} from '../../apps/web/public/shop/registration-client.js';
const id='e8f133f2-e0c9-403a-950b-19ce382a776a',values={companyName:'Fixture Company',ownerName:'Fixture Owner',email:'owner@example.test',password:'Valid1!',street:'Example 1',postalCode:'10115',city:'Berlin',country:'DE'};
test('rate hints accept only bounded server seconds and never body-supplied delays',async()=>{
 for(const seconds of ['1','900','0','901','-1','1.5','01','Wed, 01 Jan 2027 00:00:00 GMT'])await assert.rejects(requestShopRegistration({requestId:id,registration:values,fetcher:async()=>Response.json({code:'REGISTRATION_LIMIT',retryAfter:999999},{status:429,headers:{'Retry-After':seconds}})}),e=>e.code==='REGISTRATION_LIMIT'&&e.retryAfter===(['1','900'].includes(seconds)?Number(seconds):undefined));
});
