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
  });
  try {
    const doc = dom.window.document;
    doc.querySelector('[name=postcode]').value = '10551';
    doc.getElementById('search').dispatchEvent(new dom.window.Event('submit',{cancelable:true}));
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
