import assert from 'node:assert/strict';
import path from 'node:path';
// Run only against the disposable acceptance app. No account or provider requests.
export async function customerStabilityBrowserChecks({page,base,artifacts}){
 for(const width of [1280,768,390]){
  await page.setViewportSize({width,height:900});await page.goto(base+'/shop/');
  await page.evaluate(()=>{sessionStorage.clear();localStorage.removeItem('bringness.shop.browse.v1');sessionStorage.setItem('bringness.shop.cart.v2','{broken');});await page.reload();
  assert.equal(await page.evaluate(()=>sessionStorage.getItem('bringness.shop.cart.v2')),'{broken');assert.match(await page.locator('#storage-status').textContent(),/nicht überschrieben/);
  await page.locator('#search').fill('Software');assert.equal(await page.locator('#products .card').count(),3);await page.locator('#search').fill('Cloud-TSE');assert.equal(await page.locator('#products .card').count(),1);
  await page.locator('#products .card-actions button').filter({hasText:'In den Warenkorb'}).click();await page.locator('#cart-open').click();const quantity=page.locator('[data-cart-action=quantity]');
  await quantity.fill('1.5');assert.equal(await page.locator('#review-open').isDisabled(),true);await page.locator('#products .card-actions button').filter({hasText:'In den Warenkorb'}).click();
  assert.equal(await quantity.inputValue(),'1.5');assert.equal(await page.locator('#review-open').isDisabled(),true);assert.equal(await page.locator('#cart-count').textContent(),'2');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),'Invalid cart overflow '+width);
  if(artifacts)await page.screenshot({animations:'disabled',path:path.join(artifacts,'bringness-customer-stability-'+width+'.png')});
  await page.locator('#cart-dialog [data-close]').first().click();await page.locator('#cart-open').click();assert.equal(await quantity.inputValue(),'1.5');await quantity.fill('3');await quantity.press('Enter');assert.equal(await page.locator('#cart-count').textContent(),'3');
  await page.reload();assert.equal(await page.locator('#cart-count').textContent(),'3');await page.locator('#cart-open').click();assert.equal(await quantity.inputValue(),'3');await quantity.fill('1');await quantity.press('Enter');await page.locator('#review-open').click();assert.match(await page.locator('#review-content').textContent(),/1 × Bringness POS Online/);assert.match(await page.locator('#review-content').textContent(),/41,64/);
  await page.locator('#review-back').click();await page.locator('[data-cart-action=remove]').click();await page.locator('#cart-undo button').click();assert.equal(await page.locator('#cart-count').textContent(),'1');await page.locator('[data-cart-action=remove]').click();await page.locator('#cart-dialog [data-close]').first().click();
  await page.evaluate(()=>{sessionStorage.clear();localStorage.removeItem('bringness.shop.browse.v1');});await page.reload();
 }
}
