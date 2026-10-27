import assert from 'node:assert/strict';
// Disposable acceptance accounts only. The first write reaches the server, but its
// response is deliberately lost. The exact retry must return its original receipt.
export async function sellerRecoveryBrowserChecks({page,base}){
 for(const width of [1280,768,390]){
  await page.setViewportSize({width,height:900});await page.goto(base+'/shop/seller.html');
  for(const [name,value]of Object.entries({title:'CI recovery '+width,description:'Disposable recovery browser test',price:'12,50',stock:'2',delivery:'Synthetic delivery within five days'}))await page.locator('[name='+name+']').fill(value);
  await page.locator('[name=category]').selectOption('Baumarkt');await page.locator('[name=tax]').selectOption('19');
  const writes=[];let lose=true;
  const route=async request=>{
   if(request.request().method()!=='POST')return request.continue();
   writes.push(request.request().postDataJSON());
   if(lose){lose=false;const response=await request.fetch();assert.equal(response.status(),200);return request.abort('failed');}
   return request.continue();
  };
  await page.route('**/api/v1/shop/seller/offers',route);
  try{
   await page.locator('#cloud-editor-save').click();await page.locator('#cloud-editor-retry:not([hidden])').waitFor();
   await page.locator('[name=title]').fill('CI newer unsaved '+width);await page.locator('#cloud-editor-retry').click();
   await page.locator('#cloud-editor-status').filter({hasText:'Ursprüngliche Anfrage bestätigt'}).waitFor();
   assert.equal(await page.locator('#cloud-editor-save').isDisabled(),true);assert.equal(await page.locator('[name=title]').inputValue(),'CI newer unsaved '+width);
   assert.deepEqual(writes[0],writes[1]);assert.equal(writes.length,2);assert.equal(await page.locator('#cloud-offer-id').inputValue(),writes[0].id);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),'Recovery overflow '+width);
   page.once('dialog',dialog=>dialog.dismiss());await page.locator('#cloud-editor-load').click();assert.equal(await page.locator('[name=title]').inputValue(),'CI newer unsaved '+width);assert.equal(await page.locator('#cloud-editor-save').isDisabled(),true);
   page.once('dialog',dialog=>dialog.accept());await page.locator('#cloud-editor-load').click();await page.locator('#cloud-editor-status').filter({hasText:'Aus dem Betriebskonto geladen'}).waitFor();
   assert.equal(await page.locator('[name=title]').inputValue(),'CI recovery '+width);assert.equal(await page.locator('#cloud-editor-save').isDisabled(),false);
  }finally{await page.unroute('**/api/v1/shop/seller/offers',route);}
 }
}
