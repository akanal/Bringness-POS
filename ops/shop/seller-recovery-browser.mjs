import assert from 'node:assert/strict';
// Canonical browser origin, with every request forwarded exclusively to the
// disposable loopback application. No production traffic or account is used.
export async function sellerRecoveryBrowserChecks({browser,base,token}){
 const origin='https://bringness.de',context=await browser.newContext(),page=await context.newPage(),errors=[],external=[];
 let writes=[],lose=false;
 page.on('pageerror',error=>errors.push(error.message));
 await context.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url());
  if(url.origin!==origin){external.push(url.origin);return route.abort();}
  const response=await fetch(base+url.pathname+url.search,{method:request.method(),headers:await request.allHeaders(),...(request.postDataBuffer()?{body:request.postDataBuffer()}:{}),redirect:'manual'});
  if(url.pathname==='/api/v1/shop/seller/offers'&&request.method()==='POST'){
   writes.push(request.postDataJSON());assert.equal(response.status,200);
   if(lose){lose=false;await response.arrayBuffer();return route.abort('failed');}
  }
  return route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:Buffer.from(await response.arrayBuffer())});
 });
 try{
  await page.goto(origin+'/shop/seller.html');await page.evaluate(value=>localStorage.setItem('bringness-pos-token',value),token);
  for(const width of [1280,768,390]){
   await page.setViewportSize({width,height:900});await page.goto(origin+'/shop/seller.html');
   for(const [name,value]of Object.entries({title:'CI recovery '+width,description:'Disposable recovery browser test',price:'12,50',stock:'2',delivery:'Synthetic delivery within five days'}))await page.locator('[name='+name+']').fill(value);
   await page.locator('[name=category]').selectOption('Baumarkt');await page.locator('[name=tax]').selectOption('19');writes=[];lose=true;
   await page.locator('#cloud-editor-save').click();await page.locator('#cloud-editor-retry:not([hidden])').waitFor();
   await page.locator('[name=title]').fill('CI newer unsaved '+width);await page.locator('#cloud-editor-retry').click();
   await page.locator('#cloud-editor-status').filter({hasText:'Ursprüngliche Anfrage bestätigt'}).waitFor();
   assert.equal(await page.locator('#cloud-editor-save').isDisabled(),true);assert.equal(await page.locator('[name=title]').inputValue(),'CI newer unsaved '+width);
   assert.deepEqual(writes[0],writes[1]);assert.equal(writes.length,2);assert.equal(await page.locator('#cloud-offer-id').inputValue(),writes[0].id);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),'Recovery overflow '+width);
   page.once('dialog',dialog=>dialog.dismiss());await page.locator('#cloud-editor-load').click();assert.equal(await page.locator('[name=title]').inputValue(),'CI newer unsaved '+width);assert.equal(await page.locator('#cloud-editor-save').isDisabled(),true);
   page.once('dialog',dialog=>dialog.accept());await page.locator('#cloud-editor-load').click();await page.locator('#cloud-editor-status').filter({hasText:'Aus dem Betriebskonto geladen'}).waitFor();
   assert.equal(await page.locator('[name=title]').inputValue(),'CI recovery '+width);assert.equal(await page.locator('#cloud-editor-save').isDisabled(),false);
   await page.evaluate(async()=>{document.querySelector('#cloud-editor-save').click();window.dispatchEvent(new Event('pagehide'));await new Promise(resolve=>setTimeout(resolve,100));});
   assert.equal(writes.length,2,'A page hidden during identity checking must not submit a new write');
  }
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
 }finally{await context.close();}
}
