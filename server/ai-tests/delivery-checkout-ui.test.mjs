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
  });
  try {
    const doc = dom.window.document;
    doc.querySelector('[name=postcode]').value='10551';
    doc.querySelector('[name=mode][value=pickup]').checked=true;
    doc.getElementById('search').dispatchEvent(new dom.window.Event('submit',{cancelable:true}));
    await wait();
    const menu = doc.querySelector('#restaurants details');
    menu.open=true;
    await new Promise(resolve=>menu.addEventListener('toggle',resolve,{once:true}));
    await wait();
    const favorite = doc.querySelector('[data-favorite-id]');
    favorite.click();
    assert.equal(favorite.getAttribute('aria-pressed'),'true');
    assert.equal(JSON.parse(dom.window.localStorage.getItem('bringness.ordering.favorites'))[0].id,restaurantId);
    assert.match(doc.getElementById('customerFavorites').textContent,/Pilotrestaurant/);
    doc.querySelector('#customerFavorites button').click();
    assert.equal(favorite.getAttribute('aria-pressed'),'false');
    const add = menu.querySelector('button');
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

test('sandbox address book switches the delivery form and searches the new postcode',async()=>{
  const searches = [];
  const dom = new JSDOM(html,{url:'https://sandbox-bestellen.bringness.de/bestellen/',runScripts:'outside-only'});
  try {
    dom.window.fetch = async path=>{
      if (path.endsWith("/customer/session")) return Response.json({customer:null});
      searches.push(new URL(path,dom.window.location.href).searchParams.get('postcode'));
      return Response.json({restaurants:[]});
    };
    dom.window.eval(script);
    const doc = dom.window.document;
    const addressForm = doc.getElementById('saveTestAddress');
    for (const [label,postcode,street] of [['Zuhause','10551','Testweg 1'],['Arbeit','10997','Testweg 2']]) {
      for (const [field,value] of Object.entries({label,postcode,street,recipient:'Testkunde',city:'Berlin'})) {
        addressForm.elements[field].value = value;
      }
      addressForm.dispatchEvent(new dom.window.Event('submit',{cancelable:true}));
      await wait();
    }
    const select = doc.getElementById('savedDeliveryAddress');
    assert.equal(select.options.length,3);
    assert.equal(doc.getElementById('deliveryStreet').value,'Testweg 2');
    select.selectedIndex = 1;
    select.dispatchEvent(new dom.window.Event('change'));
    await wait();
    assert.equal(doc.getElementById('deliveryStreet').value,'Testweg 1');
    assert.deepEqual(searches,['10551','10997','10551']);
  } finally {
    dom.window.close();
  }
});

test('account address controls wait for the current request', async () => {
  const dom = new JSDOM(html, {url:'https://sandbox-bestellen.bringness.de/bestellen/', runScripts:'outside-only'});
  let finishLoad;
  const loading = new Promise(resolve => { finishLoad = resolve; });
  try {
    dom.window.fetch = async path => {
      if (path.endsWith('/customer/session')) return Response.json({customer:{email:'test@example.com'}});
      if (path.endsWith('/customer/addresses')) return loading;
      assert.ok(path.endsWith('/customer/favorites'));
      return Response.json({favorites:[]});
    };
    dom.window.eval(script);
    await wait();
    const doc = dom.window.document;
    const save = doc.querySelector('#saveTestAddress button');
    const remove = doc.getElementById('removeTestAddress');
    const select = doc.getElementById('savedDeliveryAddress');
    assert.ok(save.disabled && remove.disabled && select.disabled);

    finishLoad(Response.json({addresses:[{id:'saved', label:'Zuhause', postcode:'10551'}]}));
    await wait();
    assert.ok(!save.disabled && !remove.disabled && !select.disabled);
    assert.equal(select.options[1].value, 'saved');
  } finally {
    dom.window.close();
  }
});

test('signing out removes an applied account address from the checkout form', async () => {
  const dom = new JSDOM(html, {
    url:'https://sandbox-bestellen.bringness.de/bestellen/',
    runScripts:'outside-only'
  });
  const address = {id:'saved', label:'Zuhause', postcode:'10551', street:'Testweg 1', city:'Berlin', recipient:'Testkunde'};
  try {
    dom.window.fetch = async path => {
      if (path.endsWith('/customer/session')) return Response.json({customer:{email:'test@example.com'}});
      if (path.endsWith('/customer/addresses')) return Response.json({addresses:[address]});
      if (path.endsWith('/customer/favorites')) return Response.json({favorites:[]});
      if (path.endsWith('/customer/logout')) return Response.json({customer:null});
      assert.ok(path.includes('/restaurants?'));
      return Response.json({restaurants:[]});
    };
    dom.window.eval(script);
    await wait();
    const doc = dom.window.document;
    const select = doc.getElementById('savedDeliveryAddress');
    select.value = address.id;
    select.dispatchEvent(new dom.window.Event('change'));
    assert.equal(doc.getElementById('deliveryStreet').value, address.street);

    doc.getElementById('customerLogout').click();
    await wait();
    assert.equal(select.options.length, 1);
    assert.equal(doc.getElementById('deliveryStreet').value, '');
    assert.equal(doc.getElementById('testAddressFeedback').textContent, '');
  } finally {
    dom.window.close();
  }
});

test('customer order history displays confirmed orders and clears them on logout', async () => {
  const dom = new JSDOM(html, {
    url:'https://sandbox-bestellen.bringness.de/bestellen/',
    runScripts:'outside-only'
  });
  const responses = {
    session:{customer:{email:'test@example.com'}},
    addresses:{addresses:[]},
    favorites:{favorites:[]},
    orders:{orders:[{restaurant:'Testbistro',totalCents:799,date:'2026-11-25T17:00:00Z',mode:'delivery',status:'ready',items:[{name:'Pizza',quantity:2}]}]},
    logout:{customer:null}
  };
  try {
    dom.window.fetch = async path => Response.json(responses[path.split('/').at(-1)]);
    dom.window.eval(script);
    await wait();
    const doc = dom.window.document;
    const history = doc.getElementById('customerOrderHistory');
    const list = doc.getElementById('customerOrderHistoryList');
    assert.equal(history.hidden, false);
    history.open = true;
    history.dispatchEvent(new dom.window.Event('toggle'));
    await wait();
    assert.match(list.textContent, /25\.11\.2026 · Testbistro · Lieferung · 7,99\s€ · Fertig zur Übergabe/);
    responses.orders.orders[0].status = 'dispatched';
    responses.orders.orders[0].estimatedArrival = '2026-11-25T17:30:00Z';
    doc.getElementById('refreshCustomerOrders').click();
    await wait();
    assert.match(list.textContent, /Unterwegs/);
    assert.match(list.textContent, /Voraussichtliche Ankunft: 18:30 Uhr/);
    assert.equal(list.firstElementChild.querySelector('details ul li').textContent, '2 × Pizza');
    assert.equal(list.childElementCount, 1);

    doc.getElementById('customerLogout').click();
    await wait();
    assert.equal(history.hidden, true);
    assert.equal(list.childElementCount, 0);
  } finally {
    dom.window.close();
  }
});
