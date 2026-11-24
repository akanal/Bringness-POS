import assert from 'node:assert/strict';
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
