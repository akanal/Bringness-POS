import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {servePublicSearch} from './public-search.js';
function request(host, url, method='GET', mode='pos') {
  const res={writeHead(status,headers){this.status=status;this.headers=headers;},end(body){this.body=body;}};
  return {handled:servePublicSearch({headers:{host},url,method},res,mode),res};
}
test('each brand host publishes its own sitemap and robots without cross-domain or private links',()=>{
  for(const [host,origin,paths] of [['bringness-pos.de','https://bringness-pos.de',['/','/vorfuehrung/','/preise/','/ueber-uns/','/qr-bestellungen.html']],['bringness.de','https://bringness.de',['/','/shop/marketplace.html']]]) {
    for(const name of [host,'www.'+host,host.toUpperCase()+':443']) {
      const {handled,res}=request(name,'/sitemap.xml?probe=1');assert.equal(handled,true);assert.equal(res.status,200);
      assert.deepEqual([...res.body.matchAll(/<loc>(.*?)<\/loc>/g)].map(x=>x[1]),paths.map(p=>origin+p));
      assert.match(res.headers['content-type'],/xml/);
      const robots=request(name,'/robots.txt').res;assert(robots.body.includes('Sitemap: '+origin+'/sitemap.xml'));
      assert.match(robots.body,/Disallow: \/api\//);assert.match(robots.body,/Disallow: \/pos\//);
      assert.equal(request(name,'/sitemap.xml','HEAD').res.body,undefined);
    }
  }
});
test('unknown hosts, writes and application routes preserve their original behavior',()=>{
  for(const host of ['bringness.de.evil','bringness-pos.de:444','bringness.com','localhost'])assert.equal(request(host,'/sitemap.xml').handled,false);
  for(const method of ['POST','PUT','DELETE'])assert.equal(request('bringness.de','/robots.txt',method).handled,false);
  assert.equal(request('bringness.de','/sitemap.xml','GET','combined').handled,false);
  assert.equal(request('bringness-pos.de','/api/v1/mollie/webhook').handled,false);
  const start=fs.readFileSync(new URL('./start.js',import.meta.url),'utf8');
  assert(start.indexOf('if (servePublicSearch(')<start.indexOf('if (redirectLegacyPosDomain('));
});
test('POS and marketplace homepage identities match their own domains; POS describes the full system',()=>{
  const pos=fs.readFileSync(new URL('../apps/web/public/index.html',import.meta.url),'utf8');
  const market=fs.readFileSync(new URL('../apps/web/public/shop/index.html',import.meta.url),'utf8');
  assert.match(pos,/<link rel="canonical" href="https:\/\/bringness-pos.de\/">/);
  assert.match(pos,/<meta property="og:url" content="https:\/\/bringness-pos.de\/">/);
  const schema=JSON.parse(pos.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);assert.equal(schema.url,'https://bringness-pos.de/');
  assert.match(market,/<link rel="canonical" href="https:\/\/bringness.de\/">/);
  for(const text of ['Personal & Rechte','Belege & Auswertungen','Dienstplanung','Abholnummern','/vorfuehrung/'])assert(pos.includes(text));
});

test('public POS product canonicals no longer identify the marketplace',()=>{
  for(const [file,path] of [['preise/index.html','/preise/'],['ueber-uns/index.html','/ueber-uns/'],['qr-bestellungen.html','/qr-bestellungen.html']]) {
    const html=fs.readFileSync(new URL('../apps/web/public/'+file,import.meta.url),'utf8');
    assert(html.includes('<link rel="canonical" href="https://bringness-pos.de'+path+'">'));
    assert(!/Ahmet|Kanal/.test(html));
  }
});

test('dedicated POS legal presentation preserves original legal content without marketplace navigation',()=>{
  for(const name of ['impressum','datenschutz']) {
    const source=fs.readFileSync(new URL('../apps/web/public/'+name+'/index.html',import.meta.url),'utf8');
    const pos=fs.readFileSync(new URL('../apps/web/public/rechtliches/'+name+'/index.html',import.meta.url),'utf8');
    assert.equal(pos.match(/<main>[\s\S]*?<\/main>/)[0],source.match(/<main>[\s\S]*?<\/main>/)[0]);
    assert(!pos.includes('/shop/'));
    assert(pos.includes('noindex,follow'));
  }
});
