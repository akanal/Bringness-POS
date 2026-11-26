import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createDeliveryPortal} from './delivery-portal.js';
import {createDeliveryMerchant} from './delivery-merchant.js';

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
  let verified = true;
  let dishes = [{id:restaurantId}];
  const db = {async query(sql){
    return {rows:sql.includes('FROM pos_delivery_merchants') ? (verified ? [{}] : []) : dishes};
  }};
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
  assert.equal(sandboxMenu.basketPreview,undefined);

  verified = false;
  const host = new URL(sandbox.origin).host;
  const preview = (await request(menu,host)).body;
  assert.equal(preview.basketPreview,true);
  assert.equal(preview.testOrders,false);
  assert.equal(preview.onlinePickup,false);
  assert.equal(preview.mollieTestCheckout,false);
  assert.equal((await request(menu,'bringness.de')).body.basketPreview,undefined);
  assert.equal((await request(menu.replace(restaurantId,'00000000-0000-0000-0000-000000000002'),host)).body.basketPreview,undefined);
  dishes = [];
  assert.equal((await request(menu,host)).body.basketPreview,undefined);
});

test('merchant diagnostics distinguish pending Mollie checks and only save a verified matching profile', async () => {
  let organization = 'org_1';
  let profileStatus = 'unverified';
  let canReceivePayments = false;
  let canReceiveSettlements = false;
  let saved = false;
  let writes = 0;
  let testMethods = [];
  const db = {async query(sql, args) {
    if (sql.includes('INSERT INTO')) {
      writes++;
      assert.deepEqual(args.slice(2),['envelope','org_1','pfl_1']);
      return {rows:saved ? [{}] : []};
    }
    return {rows:[{organization_id:'org_1',profile_id:'pfl_1',ready:false,linked:false,connectionReady:true}]};
  }};
  const handler = createDeliveryMerchant(db,{
    access:'SELECT id FROM restaurants',
    withToken:async (db,id,operation) => operation('test-token','envelope'),
    fetcher:async url => Response.json(url.includes('/methods?')
      ? (assert.equal(new URL(url).search,'?profileId=pfl_1&testmode=true'),{_embedded:{methods:testMethods}})
      : url.endsWith('/organizations/me') ? {id:organization}
      : url.endsWith('/onboarding/me') ? {canReceivePayments,canReceiveSettlements}
      : {id:'pfl_1',status:profileStatus})
  });
  const request = (method, options) => handler({method},(status,body)=>({status,...body}),'test-restaurant','hash',options);

  assert.equal((await request('GET')).connectionReady,true);
  organization = 'org_other';
  assert.match((await request('PUT')).error,/passt nicht/);
  organization = 'org_1';
  assert.match((await request('PUT')).error,/noch nicht verifiziert/);
  profileStatus = 'verified';
  assert.match((await request('PUT')).error,/für: Zahlungen und Auszahlungen\./);
  canReceiveSettlements = true;
  assert.match((await request('PUT')).error,/für: Zahlungen\./);
  canReceiveSettlements = false;
  canReceivePayments = true;
  assert.match((await request('PUT')).error,/für: Auszahlungen\./);
  assert.equal(writes,0);
  canReceiveSettlements = true;
  assert.match((await request('PUT')).error,/während der Prüfung geändert/);
  saved = true;
  assert.equal((await request('PUT')).ready,true);
  assert.equal(writes,2);
  canReceivePayments = false;
  canReceiveSettlements = false;
  assert.match((await request('PUT',{testMode:true})).error,/keine verfügbare Test-Zahlungsart/);
  assert.equal(writes,2);
  testMethods = [{id:'creditcard'}];
  assert.equal((await request('PUT',{testMode:true})).ready,true);
  assert.match((await request('PUT')).error,/Zahlungen und Auszahlungen/);
  assert.equal(writes,3);
});
