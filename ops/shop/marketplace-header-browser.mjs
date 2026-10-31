import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
export async function marketplaceHeaderBrowserChecks({page,base,artifacts}){
 const pages=["/shop/merchant-terms.html", "/shop/seller.html", "/shop/marketplace-seller.html", "/shop/download-history.html", "/shop/assistant.html", "/shop/download-review.html", "/shop/legal.html", "/shop/order-history.html", "/shop/account.html", "/shop/licences.html", "/shop/documents.html", "/shop/marketplace-payment-return.html", "/shop/my-shop.html", "/shop/payment-return.html", "/shop/help.html", "/shop/marketplace-review.html", "/shop/register.html", "/shop/marketplace.html", "/shop/seller-cloud.html", "/shop/index.html", "/impressum/", "/datenschutz/"];
 for(const width of [390,1280]){
  await page.setViewportSize({width,height:900});
  for(const path of pages){
   const response=await page.goto(base+path);assert.equal(response.status(),200,path+' reachable');
   const header=page.locator('header').first();await header.waitFor();
   const state=await header.evaluate(el=>{const shell=el.closest('.account-masthead,.shop-masthead')||el,brand=el.querySelector('.brand');return {background:getComputedStyle(shell).backgroundImage,brand:getComputedStyle(brand).color,width:document.documentElement.scrollWidth,viewport:innerWidth};});
   assert.match(state.background,/linear-gradient/,path+' header '+width);
   assert.match(state.background,/28, 98, 76/,path+' emerald '+width);
   assert.equal(state.brand,'rgb(255, 255, 255)',path+' white brand '+width);
   assert.ok(state.width<=state.viewport+2,path+' overflow '+width);
   if(path==='/shop/index.html')for(const href of ['/impressum/','/datenschutz/'])assert.equal(await page.locator('footer a[href="'+href+'"]').count(),1,'one footer link '+href);
   if(artifacts&&['/shop/account.html','/shop/marketplace-seller.html','/shop/legal.html','/impressum/'].includes(path)){await mkdir(artifacts,{recursive:true});await page.screenshot({path:artifacts+'/shared-header-'+path.replaceAll('/','-').replaceAll('.','-')+'-'+width+'.png'});}
  }
 }
 console.log('Shared emerald marketplace headers: all Shop and legal pages, white brand, mobile/desktop overflow and unique homepage legal links passed.');
}
