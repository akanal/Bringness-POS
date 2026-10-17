import test from 'node:test';
import assert from 'node:assert/strict';
import {singleByteRange} from './byte-range.js';
test('single media ranges handle prefix, open end, suffix and arbitrarily large decimal boundaries',()=>{
 assert.deepEqual(singleByteRange('',10),{status:200,start:0,end:9,length:10});assert.deepEqual(singleByteRange('bytes=2-5',10),{status:206,start:2,end:5,length:4});assert.deepEqual(singleByteRange('bytes=7-',10),{status:206,start:7,end:9,length:3});assert.deepEqual(singleByteRange('bytes=-3',10),{status:206,start:7,end:9,length:3});
 assert.deepEqual(singleByteRange('bytes=0-'+'9'.repeat(100),10),{status:206,start:0,end:9,length:10});assert.deepEqual(singleByteRange('bytes=-'+'9'.repeat(100),10),{status:206,start:0,end:9,length:10});
 for(const raw of ['bytes=-0','bytes=-','bytes=10-','bytes=8-2','bytes=0-1,3-4','items=1-2','bytes='+'9'.repeat(100)+'-'])assert.equal(singleByteRange(raw,10).status,416,raw);
 assert.equal(singleByteRange('bytes=0-0',0).status,416);
});
