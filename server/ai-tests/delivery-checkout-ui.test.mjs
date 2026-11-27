import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {test} from 'node:test';
import {JSDOM} from 'jsdom';

const root = new URL('../../apps/web/public/bestellen/',import.meta.url);
const [html,script] = await Promise.all(['index.html','preview.js'].map(file=>readFile(new URL(file,root),'utf8')));
const restaurantId = '00000000-0000-0000-0000-000000000001';
const dishId = '00000000-0000-0000-0000-000000000002';
const wait = () => new Promise(resolve=>setImmediate(resolve));
function page(fetcher,hash='') {
  const dom = new JSDOM(html,{url:'https://portal.example/bestellen/'+hash,runScripts:'outside-only'});
  dom.window.fetch = fetcher;
  dom.window.eval(script);
  return dom;
}

test('pickup page submits the current total and retries with the same request ID',async()=>{
  const orders = [];
  const dom = page(async(path,options)=>{
    if (path.includes('/restaurants?')) return Response.json({restaurants:[{id:restaurantId,name:'Pilotrestaurant',minutes:20}]});
    if (path.includes('/menu?')) return Response.json({menu:[{id:dishId,name:'Pizza',cents:900}],onlinePickup:true,testOrders:false});
    assert.equal(path,'/api/v1/delivery-portal/checkout');
    orders.push(JSON.parse(options.body));
    return Response.json({status:'unconfirmed'},{status:202});
  }, '?mode=pickup&postcode=10551');
  try {
    const doc = dom.window.document;
    await wait();
    const menu = doc.querySelector('#restaurants details');
    menu.open=true;
    await new Promise(resolve=>menu.addEventListener('toggle',resolve,{once:true}));
    await wait();
    const add = doc.querySelector('#restaurants button');
    assert.equal(add.textContent,'Zum Warenkorb');
    add.click();
    const finish = doc.getElementById('finishDemo');
    assert.equal(finish.textContent,'Zahlungspflichtig bestellen');
    assert.match(doc.getElementById('basketTotal').textContent,/9,00/);
    finish.click();
    await wait();
    finish.click();
    await wait();
    assert.equal(orders.length,2);
    assert.deepEqual(orders[0],orders[1]);
    assert.deepEqual(orders[0].items,[{id:dishId,qty:1}]);
    assert.equal(orders[0].expectedTotalCents,900);
    assert.equal(orders[0].restaurantId,restaurantId);
  } finally {
    dom.window.close();
  }
});

test('return from online payment shows the POS pickup status through collection',async()=>{
  const statuses = ['open','ready','collected'];
  const dom = new JSDOM(html,{url:'https://portal.example/bestellen/#onlinezahlung='+restaurantId,runScripts:'outside-only'});
  try {
    const scheduled = [];
    dom.window.setTimeout = callback=>{scheduled.push(callback);};
    dom.window.fetch = async (path,options)=>{
      if (path.includes('/restaurants?')) return Response.json({restaurants:[]});
      assert.equal(path,'/api/v1/delivery-portal/payment-status');
      assert.equal(options.headers.authorization,'Bearer '+restaurantId);
      return Response.json({status:'paid',orderId:restaurantId,fulfillmentStatus:statuses.shift()});
    };
    dom.window.eval(script);
    const form = dom.window.document.getElementById('search');
    assert.equal(form.action, 'https://portal.example/bestellen/');
    assert.equal(form.method, 'get');
    const tracking = dom.window.document.getElementById('testTrackingStatus');
    for (const label of ['Eingegangen','Abholbereit','Abgeholt']) {
      await wait();
      assert.match(tracking.textContent,new RegExp(label));
      scheduled.shift()?.();
    }
    assert.equal(scheduled.length,0);
    assert.equal(statuses.length,0);
  } finally {
    dom.window.close();
  }
});

test('an older menu response cannot replace the reopened menu', async () => {
  const requests = [];
  const dom = page(path => {
    if (path.includes('/restaurants?')) {
      return Promise.resolve(Response.json({restaurants:[{id:restaurantId,name:'Pilotrestaurant',minutes:20}]}));
    }
    return new Promise(resolve => requests.push(resolve));
  }, '?mode=delivery&postcode=10551');
  try {
    const doc = dom.window.document;
    await wait();
    const menu = doc.querySelector('#restaurants details');
    async function setOpen(open) {
      const toggled = new Promise(resolve => menu.addEventListener('toggle',resolve,{once:true}));
      menu.open = open;
      await toggled;
    }
    await setOpen(true);
    await setOpen(false);
    await setOpen(true);
    assert.equal(requests.length,2);
    requests[1](Response.json({menu:[{id:dishId,name:'Aktuelle Pizza',cents:900}],onlinePickup:true}));
    await wait();
    requests[0](Response.json({menu:[{id:dishId,name:'Alte Pizza',cents:500}],onlinePickup:true}));
    await wait();
    assert.match(menu.textContent,/Aktuelle Pizza/);
    assert.doesNotMatch(menu.textContent,/Alte Pizza/);
  } finally {
    dom.window.close();
  }
});

test('adding a dish from a refreshed menu uses the new price for all its portions', () => {
  const dom = page(() => { throw Error('No network request expected'); });
  try {
    const {window} = dom;
    const restaurant = {id:restaurantId,name:'Pilotrestaurant',feeCents:250,minimumCents:0};
    window.addDish(restaurant,true,{id:dishId,name:'Pizza',cents:900},'10551',true);
    window.addDish({...restaurant,feeCents:300},true,{id:dishId,name:'Pizza',cents:1000},'10551',true);
    const doc = window.document;
    assert.match(doc.getElementById('basketTotal').textContent,/23,00/);
    assert.match(doc.getElementById('basketMessage').textContent,/aktualisiert/);
    assert.match(doc.getElementById('basketItems').textContent,/2 × Pizza/);
    assert.equal(doc.querySelectorAll('#basketItems li').length,1);
  } finally {
    dom.window.close();
  }
});

test('a saved coverage link starts the requested search only for valid inputs', async () => {
  for (const [query, valid] of [
    ['?mode=pickup&postcode=10551', true],
    ['?mode=delivery&postcode=20095', true],
    ['?mode=pickup&postcode=01067', true],
    ['?mode=pickup&postcode=1055', false],
    ['?mode=other&postcode=10551', false]
  ]) {
    const calls = [];
    const dom = page(async path => {
      calls.push(path);
      return Response.json({restaurants:[]});
    }, query);
    try {
      await wait();
      const expected = new URLSearchParams(query);
      assert.equal(calls.length, valid ? 1 : 0);
      const doc = dom.window.document;
      assert.equal(doc.body.classList.contains('search-page'), valid);
      assert.equal(doc.getElementById('landingHeading').hidden, valid);
      assert.equal(doc.getElementById('searchHeading').hidden, !valid);
      if (valid) {
        assert.match(doc.getElementById('searchLabel').textContent, new RegExp(expected.get('postcode')));
        const actual = new URL(calls[0], 'https://portal.example').searchParams;
        assert.equal(actual.get('mode'), expected.get('mode'));
        assert.equal(actual.get('postcode'), expected.get('postcode'));
      }
    } finally {
      dom.window.close();
    }
  }
});

test('sandbox preview displays and changes a basket without submitting an order', async () => {
  const paths = [];
  const dom = page(async path => {
    paths.push(path);
    if (path.includes('/restaurants?')) {
      return Response.json({restaurants:[{id:restaurantId,name:'Testrestaurant',minutes:30}]});
    }
    assert.match(path,/\/menu\?/);
    return Response.json({menu:[{id:dishId,name:'Testartikel',cents:100}],basketPreview:true});
  }, '?mode=pickup&postcode=10551');
  try {
    await wait();
    const doc = dom.window.document;
    const menu = doc.querySelector('#restaurants details');
    const toggled = new Promise(resolve => menu.addEventListener('toggle',resolve,{once:true}));
    menu.open = true;
    await toggled;
    await wait();

    const add = menu.querySelector('button');
    add.click();
    add.click();
    const basket = doc.getElementById('demoBasket');
    const finish = doc.getElementById('finishDemo');
    assert.equal(basket.hidden,false);
    assert.match(basket.textContent,/2 × Testartikel/);
    assert.match(doc.getElementById('basketTotal').textContent,/2,00/);
    assert.equal(doc.getElementById('basketPreviewNotice').hidden,false);
    assert.equal(finish.hidden,true);
    assert.equal(finish.disabled,true);
    finish.dispatchEvent(new dom.window.Event('click'));
    await wait();
    assert.equal(paths.length,2);

    basket.querySelector('#basketItems button').click();
    assert.match(doc.getElementById('basketTotal').textContent,/1,00/);
    basket.querySelector('#basketItems button').click();
    assert.equal(basket.hidden,true);
  } finally {
    dom.window.close();
  }
});

test('a new test order replaces pending payment tracking and ignores its late response', async () => {
  let resolvePayment;
  const paths = [];
  const dom = page(async path => {
    paths.push(path);
    if (path.endsWith('/test-payment-status')) return new Promise(resolve => {resolvePayment=resolve;});
    if (path.endsWith('/test-status')) return Response.json({status:'collected',mode:'pickup'});
    if (path.endsWith('/test-order')) return Response.json({orderId:dishId});
    throw Error('Unexpected request');
  }, '#zahlung='+restaurantId);
  try {
    const {window} = dom;
    window.addDish({id:restaurantId,name:'Testrestaurant'},false,{id:dishId,name:'Pizza',cents:100},'10551');
    window.document.getElementById('finishDemo').click();
    await wait();
    const tracking = window.document.getElementById('testTrackingStatus');
    assert.match(tracking.textContent,/Abgeholt/);
    resolvePayment(Response.json({status:'expired'}));
    await wait();
    assert.match(tracking.textContent,/Abgeholt/);
    assert.equal(paths.length,3);
    assert.equal(window.location.hash,'');
  } finally {
    dom.window.close();
  }
});

test('return from test payment ignores previously saved tracking and resumes at the kitchen', async () => {
  const dom = new JSDOM(html,{url:'https://portal.example/bestellen/#zahlung='+restaurantId,runScripts:'outside-only'});
  try {
    const {window} = dom;
    const paths = [];
    const timers = [];
    window.setTimeout = callback => {timers.push(callback);};
    window.sessionStorage.setItem('bringness.portal.testTracking',JSON.stringify({orderId:dishId,requestId:dishId}));
    window.fetch = async (path,options) => {
      paths.push(path);
      assert.equal(options.headers.authorization,'Bearer '+restaurantId);
      if (path.endsWith('/test-status')) return Response.json({status:'collected',mode:'pickup'});
      return Response.json(paths.length===1 ? {status:'paid'} : {status:'paid',orderId:restaurantId});
    };
    window.eval(script);
    await wait();
    assert.match(window.document.getElementById('testTrackingStatus').textContent,/Bestätigung steht aus/);
    assert.equal(window.location.hash,'#zahlung='+restaurantId);
    assert.equal(timers.length,1);
    timers.shift()();
    await wait();
    assert.deepEqual(paths.map(path=>path.split('/').at(-1)),['test-payment-status','test-payment-status','test-status']);
    assert.equal(window.location.hash,'');
    assert.match(window.document.getElementById('testTrackingStatus').textContent,/Abgeholt/);
    assert.equal(timers.length,0);
  } finally {
    dom.window.close();
  }
});

test('address and device location suggestions use the selected postcode without putting the address in the URL', async () => {
  const addressScript = await readFile(new URL('address-search.js', root), 'utf8');
  const dom = new JSDOM(html, {
    url:'https://sandbox-bestellen.bringness.de/bestellen/', runScripts:'outside-only'
  });
  const {window} = dom;
  const doc = window.document;
  const requests = [];
  const submissions = [];
  window.fetch = async url => {
    requests.push(url);
    return {ok:true, json:async () => ({features:[{properties:{
      street:'Stromstraße', housenumber:'11', postcode:'10551', city:'Berlin', countrycode:'DE'
    }}]})};
  };
  Object.defineProperty(window.navigator, 'geolocation', {
    value:{getCurrentPosition: success => success({coords:{latitude:52.53, longitude:13.34}})}
  });
  const form = doc.getElementById('search');
  const input = doc.getElementById('addressSearch');
  window.eval(addressScript);
  form.addEventListener('submit', event => {
    if (!event.defaultPrevented) submissions.push(Object.fromEntries(new window.FormData(form)));
    event.preventDefault();
  });
  try {
    input.value = 'stromst';
    input.dispatchEvent(new window.Event('input'));
    form.requestSubmit();
    await wait();
    const suggestion = () => doc.querySelector('#addressSuggestions button');
    assert.match(suggestion().textContent, /Stromstraße 11, 10551 Berlin/);
    suggestion().click();
    assert.deepEqual(submissions[0], {mode:'delivery', postcode:'10551'});
    doc.getElementById('useLocation').click();
    await wait();
    assert.equal(requests[1].pathname, '/reverse');
    assert.equal(requests[1].searchParams.get('lat'), '52.53');
    suggestion().click();
    input.value = '01067';
    input.dispatchEvent(new window.Event('input'));
    form.requestSubmit();
    assert.equal(submissions[2].postcode, '01067');
    assert.equal(requests.length, 2);
  } finally {
    window.close();
  }
});
