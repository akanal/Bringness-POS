import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {test} from 'node:test';
import {createDeliveryPortal} from './delivery-portal.js';

test('public menu advertises online payment only for eligible pickup at the released restaurant',async()=>{
  const restaurantId = '00000000-0000-0000-0000-000000000001';
  const other = '00000000-0000-0000-0000-000000000002';
  let ready = true;
  let merchantReads = 0;
  const db = {
    async query(sql) {
      if (sql.includes('FROM pos_delivery_merchants')) {
        merchantReads++;
        return {rows:ready ? [{}] : []};
      }
      assert.match(sql,/JOIN products/);
      return {rows:[{id:other,name:'Pizza',cents:900}]};
    }
  };
  const active = createDeliveryPortal(db,{liveCheckoutOrigin:'https://portal.example',liveRestaurantId:restaurantId});
  const disabled = createDeliveryPortal(db);
  async function menu(handler,id,mode) {
    let body;
    const req = {method:'GET',url:'/api/v1/delivery-portal/menu?postcode=10551&restaurantId='+id+'&mode='+mode};
    const res = {writeHead(code){assert.equal(code,200);},end(value){body=JSON.parse(value);}};
    assert.equal(await handler(req,res),true);
    return body.onlinePickup;
  }
  assert.equal(await menu(disabled,restaurantId,'pickup'),false);
  assert.equal(await menu(active,other,'pickup'),false);
  assert.equal(await menu(active,restaurantId,'delivery'),false);
  assert.equal(merchantReads,0);
  assert.equal(await menu(active,restaurantId,'pickup'),true);
  ready = false;
  assert.equal(await menu(active,restaurantId,'pickup'),false);
});

test('sandbox exposes only Mollie test ordering at its own host and assigned restaurant',async()=>{
  const restaurantId = '00000000-0000-0000-0000-000000000001';
  const sandbox = {origin:'https://sandbox-bestellen.example.test',restaurantId};
  const db = {async query(sql){return {rows:sql.includes('FROM pos_delivery_merchants') ? [{}] : [{id:restaurantId}]};}};
  const handler = createDeliveryPortal(db,{testOrders:true,sandbox});
  async function request(path,host) {
    let result;
    const req = {method:'GET',url:'/api/v1/delivery-portal/'+path,headers:{host}};
    await handler(req,{writeHead(code){result={code};},end(value){result.body=JSON.parse(value);}});
    return result;
  }
  const menu = 'menu?postcode=10551&mode=pickup&restaurantId='+restaurantId;
  assert.equal((await request(menu,'bringness.de')).body.testOrders,false);
  const sandboxMenu = (await request(menu,new URL(sandbox.origin).host)).body;
  assert.equal(sandboxMenu.mollieTestCheckout,true);
  assert.equal(sandboxMenu.onlinePickup,false);
  assert.equal((await request('test-checkout','bringness.de')).code,404);
  assert.equal((await request('checkout',new URL(sandbox.origin).host)).code,404);
  assert.equal((await request('test-order',new URL(sandbox.origin).host)).code,404);
});

test('driver installation mail queues only for the sandbox account owner',async()=>{
  const restaurantId = '00000000-0000-0000-0000-000000000001';
  const host = 'sandbox-bestellen.example.test';
  const recipient = 'owner@example.test';
  const queued = [];
  const db = {async query(sql,params) {
    if (sql.includes('INSERT INTO transactional_mail')) {
      queued.push(params);
      return {rows:[]};
    }
    assert.match(sql,/a.role='owner'/);
    return {rows:params[2]===recipient ? [{user_id:restaurantId}] : []};
  }};
  const handler = createDeliveryPortal(db,{testOrders:true,sandbox:{origin:'https://'+host,restaurantId}});
  async function request(email,requestHost=host) {
    const req = Readable.from([Buffer.from(JSON.stringify({email}))]);
    Object.assign(req,{method:'POST',url:'/api/v1/pos/delivery-portal/driver-install?restaurantId='+restaurantId,
      headers:{host:requestHost,authorization:'Bearer session'}});
    let code;
    await handler(req,{writeHead(status){code=status;},end(){}});
    return code;
  }
  assert.equal(await request(recipient,'bringness.de'),404);
  assert.equal(await request('invalid'),400);
  assert.equal(await request('outsider@example.test'),403);
  assert.equal(await request(recipient),202);
  assert.equal(queued.length,1);
  assert.equal(queued[0][1],recipient);
});
