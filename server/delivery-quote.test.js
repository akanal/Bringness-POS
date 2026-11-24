import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {test} from 'node:test';
import {createDeliveryQuote} from './delivery-quote.js';

test('checkout quote requires a merchant and recomputes the delivery total',async()=>{
  const productId = '00000000-0000-0000-0000-000000000002';
  const settings = {delivery:true,zones:['10551'],productIds:[productId],feeCents:200,minimumCents:1000};
  let merchantReady = false;
  let releases = 0;
  const client = {
    async query(sql) {
      if (sql.includes('FROM pos_delivery_merchants')) return {rows:merchantReady ? [{}] : []};
      if (sql.includes('FROM pos_delivery_locations')) return {rows:[{settings}]};
      if (sql.includes('FROM products')) return {rows:[{id:productId,price_cents:600}]};
      assert.match(sql,/^(BEGIN ISOLATION LEVEL REPEATABLE READ|COMMIT)$/);
    },
    release() { releases++; }
  };
  const quote = createDeliveryQuote({connect:async()=>client},{idPattern:/^[0-9-]{36}$/,postcodePattern:/^\d{5}$/});
  async function request(expectedTotalCents) {
    const req = Readable.from([Buffer.from(JSON.stringify({
      restaurantId:'00000000-0000-0000-0000-000000000001',
      postcode:'10551',mode:'delivery',items:[{id:productId,qty:2}],expectedTotalCents
    }))]);
    req.method = 'POST';
    req.headers = {'content-type':'application/json'};
    return quote(req,(status,data)=>({status,data}));
  }
  assert.equal((await request(1400)).status,409);
  merchantReady = true;
  assert.equal((await request(1399)).status,409);
  assert.deepEqual(await request(1400),{status:200,data:{currency:'EUR',subtotalCents:1200,feeCents:200,totalCents:1400}});
  assert.equal(releases,3);
});
