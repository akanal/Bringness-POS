import {test} from 'node:test';import assert from 'node:assert/strict';
import {oneEdit,searchMatch,searchSuggestions,priceMatches,priceBound,distanceKm,locationMatches,relatedProducts} from '../../apps/web/public/shop/discovery-policy.js';
import {browseProducts} from '../../apps/web/public/shop/browse.js';
import {browseLocation,readBrowseLocation} from '../../apps/web/public/shop/navigation.js';
import {products} from '../../apps/web/public/shop/catalog.js';
import {validateOffer} from '../../apps/web/public/shop/offer-policy.js';
import {publicImages,mailDraft,publicSeller} from '../../apps/web/public/shop/listing-tools.js';
test('bounded fuzzy discovery accepts one edit but never changes exact numbered lookup',()=>{
 for(const [a,b]of [['windows','windwos'],['windows','windos'],['windows','windowss'],['windows','windaws']])assert.ok(oneEdit(a,b));assert.equal(oneEdit('windows','wonder'),false);
 assert.deepEqual(browseProducts({query:'Windwos'}).map(p=>p.id),['pos-download']);assert.deepEqual(browseProducts({query:'100009'}),[]);assert.deepEqual(browseProducts({query:'100002',minPrice:'999999',city:'Unknown'}).map(p=>p.id),['pos-download']);assert.deepEqual(searchSuggestions(products,'100009'),[]);
 assert.ok(searchMatch({name:'Büro Straße',description:'',category:''},'buro strasse'));
 assert.deepEqual(browseProducts({query:'AI',minPrice:'0'}),[]);
});
test('price ranges are inclusive, reject malformed/reversed input and exclude unknown prices',()=>{
 assert.equal(priceBound('34,99'),3499);assert.ok(Number.isNaN(priceBound('1e3')));assert.equal(priceMatches({netCents:3499},'34,99','34.99'),true);assert.equal(priceMatches({netCents:null},'0',''),false);assert.equal(priceMatches({netCents:1},'10','5'),false);
 assert.deepEqual(browseProducts({minPrice:'35'}).map(p=>p.id),['pos-download']);assert.deepEqual(browseProducts({maxPrice:'35'}).map(p=>p.id),['pos-online']);
});
test('navigation preserves public price/city filters while removing unrelated query data and coordinates',()=>{
 const path=browseLocation('https://example.test/shop/?token=secret&lat=52',{minPrice:'10,50',maxPrice:'99',city:'Berlin',sort:'newest'}),value=readBrowseLocation('https://example.test'+path);assert.equal(value.minPrice,'10,50');assert.equal(value.maxPrice,'99');assert.equal(value.city,'Berlin');assert.equal(value.sort,'newest');assert.doesNotMatch(path,/secret|token|lat=/);assert.equal(readBrowseLocation('https://x.test/?min=1e9').minPrice,'');
});
test('location matching never invents coordinates or treats missing locations as nearby',()=>{
 const a={lat:52.52,lon:13.405},b={lat:53.55,lon:10};assert.ok(distanceKm(a,b)>250&&distanceKm(a,b)<270);assert.equal(distanceKm(a,{lat:999,lon:1}),null);assert.equal(locationMatches({location:a},'',a,10),true);assert.equal(locationMatches({},'',a,10),false);assert.equal(locationMatches({location:{city:'Köln'}},'koln'),true);assert.deepEqual(browseProducts({city:'Berlin'}),[]);
});
test('related offers and provider/contact actions expose only the public catalogue',()=>{
 assert.equal(relatedProducts(products,products[0]).length,2);assert.equal(publicSeller({id:'private'}),null);assert.equal(mailDraft({id:'private'}),null);const draft=mailDraft(products[0],{report:true,reason:'Falsche Angaben',message:'Line\nB',href:'https://bringness.de/shop/?token=secret&ad=100001'});assert.ok(draft.startsWith('mailto:info@bringness.de?'));assert.doesNotMatch(decodeURIComponent(draft),/secret|token=/);assert.match(decodeURIComponent(draft),/100001/);
});
test('gallery accepts only bounded same-origin dedicated product media, never remote or executable URLs',()=>{
 const valid={src:'/shop/media/example.webp',alt:'Example'};assert.equal(publicImages({images:[valid,{src:'https://tracking.test/x.png',alt:'x'},{src:'javascript:x',alt:'x'},{src:'/shop/media/../x.png',alt:'x'}]}).length,1);assert.equal(publicImages({images:Array(30).fill(valid)}).length,8);assert.equal(publicImages(products[0]).length,0);
});
test('private workflow notes roundtrip without changing canonical legacy offer data',()=>{
 const offer={title:'Test',category:'Software',kind:'digital',price:'1',tax:'19',stock:'',gtin:'',condition:'new',sku:'',description:'Private test',delivery:'',fulfilment:'Download'};
 const old=validateOffer(offer);assert.equal(Object.hasOwn(old,'workflow'),false);assert.deepEqual(validateOffer({...offer,workflow:'draft'}),old);assert.equal(validateOffer({...offer,workflow:'paused'}).workflow,'paused');assert.equal(validateOffer({...offer,workflow:'sold'}).workflow,'sold');assert.throws(()=>validateOffer({...offer,workflow:'published'}));
});
