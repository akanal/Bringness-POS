import assert from 'node:assert/strict';
import {test} from 'node:test';
import {Readable} from 'node:stream';
import {createHash,randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {createDeliveryCheckout} from '../delivery-checkout.js';
import {advanceDeliveryOrder} from '../delivery-portal-test-orders.js';
import {migrateDeliveryPortal} from '../delivery-portal.js';
import {recordPosOnlineSettlement} from '../pos-online-settlement.js';

for (const [mode,paymentMode] of [['pickup','test'],['delivery','test'],['pickup','live']]) test('Mollie '+paymentMode+' '+mode+' reaches the kitchen once after a matching paid response',async()=>{
  const live = paymentMode==='live';
  const database = new PGlite();
  try {
    const query = database.query.bind(database);
    const db = {query,connect:async()=>({query,release(){}})};
    await database.exec(`
      CREATE TABLE companies(id uuid PRIMARY KEY,name text);
      CREATE TABLE restaurants(id uuid PRIMARY KEY,company_id uuid,name text);
      CREATE TABLE users(id uuid PRIMARY KEY,company_id uuid,role text,status text,must_change_password boolean);
      CREATE TABLE sessions(user_id uuid,token_hash text,expires_at timestamptz);
      CREATE TABLE company_billing_profiles(company_id uuid,company_name text,street text,postal_code text,city text,vat_id text);
      CREATE TABLE payments(order_id uuid,method text,amount_cents integer);
      CREATE TABLE receipts(order_id uuid UNIQUE,receipt_number text UNIQUE,fiscal_status text,merchant_snapshot jsonb);
      CREATE SEQUENCE receipt_number_seq;
      CREATE TABLE categories(id uuid,restaurant_id uuid,active boolean);
      CREATE TABLE products(id uuid,restaurant_id uuid,category_id uuid,name text,price_cents int,tax_rate int,active boolean);
      CREATE TABLE center_mollie_credentials(restaurant_id uuid,organization_id text,profile_id text,token_envelope text,verified_at timestamptz);
      CREATE TABLE orders(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),restaurant_id uuid,source text,status text,total_cents int,closed_at timestamptz);
      CREATE TABLE order_items(order_id uuid,product_id uuid,product_name_snapshot text,unit_price_cents int,tax_rate_snapshot int,quantity int);
    `);
    await migrateDeliveryPortal(db,{testOrders:true});
    const restaurantId = randomUUID(), productId = randomUUID(), requestId = randomUUID();
    const company = randomUUID();
    await query("INSERT INTO companies VALUES ($1,'Firma')",[company]);
    await query("INSERT INTO restaurants VALUES ($1,$2,'Restaurant')",[restaurantId,company]);
    await query("INSERT INTO center_mollie_credentials VALUES ($1,'org_1','pfl_1','encrypted',now())",[restaurantId]);
    await query("INSERT INTO pos_delivery_merchants (restaurant_id,organization_id,profile_id) VALUES ($1,'org_1','pfl_1')",[restaurantId]);
    await query('INSERT INTO pos_delivery_locations VALUES ($1,$2)',[restaurantId,JSON.stringify({pickup:true,delivery:true,postcode:'10551',zones:['10551'],minimumCents:500,feeCents:200,productIds:[productId]})]);
    await query("INSERT INTO products VALUES ($1,$2,NULL,'Pizza',799,7,true)",[productId,restaurantId]);
    let payment;
    let creations = 0;
    const fetcher = async (url,options)=>{
      if (options.method==='POST') {
        creations++;
        const payload = JSON.parse(options.body);
        assert.equal(payload.testmode,!live);
        assert.equal(payload.applicationFee,undefined);
        assert.doesNotMatch(options.body,/Teststraße|Test Gast/);
        payment = {id:'tr_123',mode:paymentMode,profileId:payload.profileId,metadata:payload.metadata,
          amount:payload.amount,status:'open',_links:{checkout:{href:'https://www.mollie.com/checkout/test'}}};
      } else {
        assert.equal(new URL(url).searchParams.get('testmode'),live ? null : 'true');
      }
      return Response.json(payment);
    };
    const checkout = createDeliveryCheckout(db,{
      origin:'https://preview.example/',mode:paymentMode,liveRestaurantId:restaurantId,idPattern:/^[a-f0-9-]{36}$/,postcodePattern:/^\d{5}$/,
      withToken:async (_db,_id,operation)=>operation('token','encrypted'),fetcher
    });
    const delivery = mode==='delivery';
    const address = delivery ? {recipient:'Test Gast',street:'Teststraße 1',city:'Berlin'} : undefined;
    const total = delivery ? 999 : 799;
    const input = {restaurantId,requestId,mode,postcode:'10551',items:[{id:productId,qty:1}],expectedTotalCents:total,address};
    const send = (code,data)=>({code,data});
    const start = ()=>{
      const req = Readable.from([Buffer.from(JSON.stringify(input))]);
      Object.assign(req,{method:'POST',headers:{'content-type':'application/json'}});
      return checkout(req,send,'start');
    };
    const check = ()=>checkout({method:'GET',headers:{authorization:'Bearer '+requestId}},send,'status');
    if (delivery) {
      delete input.address;
      assert.equal((await start()).code,400);
      input.address = address;
    }
    if (live) {
      input.restaurantId = randomUUID();
      assert.equal((await start()).code,404);
      input.restaurantId = restaurantId;
    }
    assert.equal((await start()).code,201);
    if (delivery) {
      input.address = {...address,street:'Teststraße 2'};
      assert.equal((await start()).code,409);
      input.address = address;
    }
    assert.equal((await start()).code,200);
    assert.equal(creations,1);
    assert.deepEqual((await check()).data,{status:'pending'});
    payment.status='paid';
    const paidAt = new Date().toISOString();
    payment.paidAt=paidAt;
    payment.amount.value=((total-1)/100).toFixed(2);
    assert.equal((await check()).code,503);
    assert.deepEqual((await query('SELECT id FROM orders')).rows,[]);
    payment.amount.value=(total/100).toFixed(2);
    payment.paidAt=new Date(Date.now()+120000).toISOString();
    assert.deepEqual((await check()).data,{status:'review'});
    assert.deepEqual((await query('SELECT id FROM orders')).rows,[]);
    payment.paidAt=paidAt;
    const webhook = Readable.from([Buffer.from('id=tr_123')]);
    Object.assign(webhook,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'}});
    assert.deepEqual(await checkout(webhook,send,'webhook'),{code:200,data:{received:true}});
    const accepted = await check();
    assert.equal(accepted.data.status,'paid');
    assert.deepEqual(await check(),accepted);
    const {rows:[booking]} = await query('SELECT delivery_test_paid_at FROM orders');
    assert.equal(booking.delivery_test_paid_at?.toISOString() ?? null,live ? null : paidAt);
    const {rows:payments} = await query('SELECT method,amount_cents FROM payments');
    assert.deepEqual(payments,live ? [{method:'mollie_delivery',amount_cents:total}] : []);
    const {rows:receipts} = await query('SELECT fiscal_status FROM receipts');
    assert.deepEqual(receipts,live ? [{fiscal_status:'pending'}] : []);
    const {rows:items} = await query('SELECT product_name_snapshot,unit_price_cents,product_id FROM order_items ORDER BY unit_price_cents');
    assert.deepEqual(items.map(item=>item.unit_price_cents),delivery ? [200,799] : [799]);
    assert.equal(items.at(-1).product_id,live ? productId : null);
    assert.deepEqual((await query('SELECT source,total_cents,delivery_test_address FROM orders')).rows,[
      {source:(live ? 'web_' : 'web_test_')+mode,total_cents:total,delivery_test_address:delivery ? {...address,postcode:'10551'} : null}
    ]);
    if (live) {
      const operator = randomUUID(), foreignOperator = randomUUID();
      await query("INSERT INTO users VALUES ($1,$2,'kitchen','active',false),($3,$4,'owner','active',false)",
        [operator,company,foreignOperator,randomUUID()]);
      for (const [user,token] of [[operator,'operator'],[foreignOperator,'foreign']]) {
        await query("INSERT INTO sessions VALUES ($1,$2,now()+interval '1 hour')",
          [user,createHash('sha256').update(token).digest('hex')]);
      }
      const orderId = accepted.data.orderId;
      async function advance(status,token='operator') {
        const req = Readable.from([Buffer.from(JSON.stringify({orderId,status}))]);
        Object.assign(req,{method:'POST',headers:{authorization:'Bearer '+token}});
        return advanceDeliveryOrder(db,req,send,/^[a-f0-9-]{36}$/,{live:true});
      }
      assert.equal(accepted.data.fulfillmentStatus,'open');
      assert.equal((await advance('ready')).code,409);
      await query("UPDATE orders SET status='preparing' WHERE id=$1",[orderId]);
      assert.equal((await advance('ready','foreign')).code,409);
      assert.equal((await advance('collected')).code,409);
      assert.equal((await advance('ready')).data.status,'ready');
      assert.equal((await check()).data.fulfillmentStatus,'ready');
      assert.equal((await advance('collected')).data.status,'collected');
      const {rows:[first]} = await query('SELECT closed_at FROM orders WHERE id=$1',[orderId]);
      assert.ok(first.closed_at);
      assert.equal((await advance('collected')).data.status,'collected');
      assert.deepEqual((await query('SELECT closed_at FROM orders WHERE id=$1',[orderId])).rows,[first]);
      assert.equal((await check()).data.fulfillmentStatus,'collected');
    }
  } finally {
    await database.close();
  }
});

test('POS books a verified portal settlement only once and excludes test orders',async()=>{
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE TABLE companies(id uuid PRIMARY KEY,name text);
      CREATE TABLE restaurants(id uuid PRIMARY KEY,company_id uuid,name text);
      CREATE TABLE orders(id uuid PRIMARY KEY,restaurant_id uuid,source text,total_cents integer);
      CREATE TABLE payments(order_id uuid,method text,amount_cents integer);
      CREATE TABLE receipts(order_id uuid UNIQUE,receipt_number text UNIQUE,fiscal_status text,merchant_snapshot jsonb);
      CREATE TABLE company_billing_profiles(company_id uuid,company_name text,street text,postal_code text,city text,vat_id text);
      CREATE SEQUENCE receipt_number_seq;
    `);
    const company = randomUUID(), restaurantId = randomUUID(), orderId = randomUUID(), testOrder = randomUUID();
    await db.query("INSERT INTO companies VALUES ($1,'Firma')",[company]);
    await db.query("INSERT INTO restaurants VALUES ($1,$2,'Restaurant')",[restaurantId,company]);
    await db.query("INSERT INTO orders VALUES ($1,$3,'web_delivery',999),($2,$3,'web_test_delivery',999)",[orderId,testOrder,restaurantId]);
    const booking = {orderId,restaurantId,amountCents:999};

    await assert.rejects(db.transaction(tx=>recordPosOnlineSettlement(tx,{...booking,orderId:testOrder})),/INVALID_ONLINE_PAYMENT_ORDER/);
    await assert.rejects(db.transaction(tx=>recordPosOnlineSettlement(tx,{...booking,amountCents:998})),/INVALID_ONLINE_PAYMENT_ORDER/);
    await assert.rejects(db.transaction(async tx=>{
      await recordPosOnlineSettlement(tx,booking);
      throw Error('release interrupted');
    }),/release interrupted/);
    assert.deepEqual((await db.query('SELECT * FROM payments')).rows,[]);
    assert.deepEqual((await db.query('SELECT * FROM receipts')).rows,[]);

    const receiptNumber = await db.transaction(tx=>recordPosOnlineSettlement(tx,booking));
    assert.match(receiptNumber,/^BN-\d{4}-\d{6}$/);
    await assert.rejects(db.transaction(tx=>recordPosOnlineSettlement(tx,booking)),/ONLINE_PAYMENT_ALREADY_RECORDED/);
    assert.deepEqual((await db.query('SELECT * FROM payments')).rows,[{order_id:orderId,method:'mollie_delivery',amount_cents:999}]);
    const {rows:[receipt]} = await db.query('SELECT * FROM receipts');
    assert.equal(receipt.fiscal_status,'pending');
    assert.equal(receipt.merchant_snapshot.restaurantName,'Restaurant');
  } finally {
    await db.close();
  }
});
