import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {serveMarketplaceHome} from './marketplace-home.js';
const home=()=>readFileSync(new URL('../apps/web/public/shop/index.html',import.meta.url),'utf8');
function run(url='/',host='bringness.de',method='GET',mode='pos') {
  const req={url,headers:{host},method},res={writeHead(status,headers){this.status=status;this.headers=headers;},end(body){this.body=body;}};
  return {handled:serveMarketplaceHome(req,res,mode,home),req,res};
}
test('public root serves real marketplace with working asset base and root fragment links',()=>{
  for(const host of ['bringness.de','www.bringness.de'])for(const url of ['/','/?q=test','/index.html']){
    const {handled,res}=run(url,host);assert.equal(handled,true);assert.equal(res.status,200);
    assert.match(res.body,/<base href="\/shop\/">/);assert.match(res.body,/home-header.css/);
    assert.match(res.body,/href="\/#angebote"/);assert.match(res.body,/id="cart-open"/);
    assert.equal(new URL('./shop.js','https://bringness.de/shop/').pathname,'/shop/shop.js');
  }
});
test('HEAD is empty; API, POS, other hosts, other modes and writes retain original routes',()=>{
  assert.equal(run('/','bringness.de','HEAD').res.body,undefined);
  for(const url of ['/api/v1/shop/status','/pos/','/service/','/shop/'])assert.equal(run(url).handled,false);
  for(const host of ['bringness-pos.de','bringness-ai.com','bringness.de.evil'])assert.equal(run('/',host).handled,false);
  assert.equal(run('/','bringness.de','POST').handled,false);
  assert.equal(run('/','bringness.de','GET','combined').handled,false);
  const old=run('/pos-info.html?from=shop');assert.equal(old.handled,false);assert.equal(old.req.url,'/index.html?from=shop');
});
