import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {checkAddress} from './address-check.js';
import {createCustomerDelivery} from './customer-delivery.js';
const address={street:'Herzbergstraße 128–139',postalCode:'10365',city:'Berlin',country:'Deutschland'};
test('local postcode index detects city mismatch and tolerates umlauts, leading zeroes and districts',()=>{
 for(const value of [address,{...address,postalCode:'10115',city:'Berlin-Mitte'}, {...address,postalCode:'80331',city:'Muenchen'}, {...address,postalCode:'01067',city:'Dresden'}])assert.equal(checkAddress(value).status,'matched');
 const wrong=checkAddress({...address,city:'Hamburg'});assert.equal(wrong.status,'warning');assert.deepEqual(wrong.issues[0].fields,['postalCode','city']);assert.match(wrong.issues[0].message,/Berlin/);
 assert.equal(checkAddress({...address,postalCode:'80331',city:'Mün'}).status,'warning');
});
test('unknown, incomplete, foreign and malformed addresses never claim full verification',()=>{
 for(const postalCode of ['99999','1234','10a15'])assert.equal(checkAddress({...address,postalCode}).status,'warning');
 assert.equal(checkAddress({...address,street:'Herzbergstraße'}).issues[0].fields[0],'street');
 assert.equal(checkAddress({...address,street:''},{complete:true}).status,'warning');
 assert.equal(checkAddress({...address,country:'Österreich',postalCode:'1010',city:'Wien'}).status,'unverified');
 assert.equal(checkAddress({country:'Deutschland'}).status,'unverified');
 assert.match(checkAddress(address).message,/existenz nicht geprüft/);
 for(const value of [null,[],{city:{}},{street:'x'.repeat(161)},{city:'a\nb'}])assert.throws(()=>checkAddress(value));
});
test('address endpoint requires authentication/role, bounds input and performs no database writes',async()=>{
 let user={id:'owner',role:'owner'};const handler=createCustomerDelivery({connect(){throw Error('No DB transaction needed');}},async()=>user);
 const run=async(value,method='POST')=>{const req=Readable.from([JSON.stringify(value)]);req.url='/api/v1/address-check';req.method=method;req.headers={};let status,body;await handler(req,{writeHead:s=>status=s,end:v=>body=JSON.parse(v)});return {status,body};};
 assert.equal((await run({address})).body.status,'matched');assert.equal((await run({address:{...address,city:'Hamburg'}})).body.status,'warning');
 assert.equal((await run({address:{city:[]}})).status,400);assert.equal((await run({address,complete:'yes'})).status,400);assert.equal((await run({},'GET')).status,405);
 user=null;assert.equal((await run({address})).status,401);user={role:'waiter'};assert.equal((await run({address})).status,403);
});
