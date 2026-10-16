import test from 'node:test';import assert from 'node:assert/strict';import {deliveryMatches,prepareProcurement} from './ai-procurement-core.js';
const offer=(id,supplier,cost,min=0)=>({id,supplier_id:supplier,name:'Mehl',unit:'kg',packs:1,pack_quantity:5,netCents:cost,minimum_order_cents:min,tradeReady:true,address:'Testweg 1',city:'Berlin',delivery_area:'Berlin',business_name:supplier,delivery_terms:''});
const item=(id,offers)=>({id,name:'Mehl',unit:'kg',location_name:'Test',delivery_city:'Berlin',offers});
test('delivery areas require explicit matching rather than substring assumptions',()=>{assert(deliveryMatches('Berlin; 10115','Berlin','10115'));assert(deliveryMatches('Deutschland','Hamburg',''));assert(!deliveryMatches('nicht Berlin','Berlin',''));assert(!deliveryMatches('','Berlin',''));assert(!deliveryMatches('Berliner Umland','Berlin',''))});
test('rounding cost outranks unit price and inactive or ambiguous offers are excluded',()=>{const r=prepareProcurement([item('stock',[offer('a','A',2000),offer('b','B',1500),{...offer('c','C',1),tradeReady:false}])]);assert.equal(r.lines[0].productId,'b');assert(r.complete)});
test('combined supplier minimum can be met across different ingredients',()=>{const r=prepareProcurement([item('s1',[offer('a','A',600,1000),offer('b','B',800)]),item('s2',[offer('c','A',600,1000)])]);assert(r.complete);assert.equal(r.netCents,1200)});
test('alternative supplier avoids an unmet minimum without adding unnecessary stock',()=>{const r=prepareProcurement([item('s',[offer('a','A',500,1000),offer('b','B',700)])]);assert(r.complete);assert.equal(r.lines[0].supplierId,'B');const blocked=prepareProcurement([item('s',[offer('a','A',500,1000)])]);assert(!blocked.complete);assert.equal(blocked.lines.length,0);assert.equal(blocked.unresolved.length,1)});
test('missing offers and oversized plans do not masquerade as complete',()=>{assert(!prepareProcurement([item('s',[])]).complete);assert.equal(prepareProcurement(Array.from({length:51},(_,i)=>item(String(i),[offer(String(i),'A',10)]))).lines.length,0)});

test('invalid supplier minimum order amounts are never auto-selected',()=>{for(const invalid of ['invalid','1000',-1,Number.POSITIVE_INFINITY,null,undefined]){const r=prepareProcurement([item('s',[{...offer('a','A',100),minimum_order_cents:invalid}])]);assert.equal(r.lines.length,0);assert.equal(r.complete,false)}});

test('supplier minimum cannot be weakened by the first line in a combined order',()=>{
 const result=prepareProcurement([
  item('s1',[offer('a','A',400,0)]),
  item('s2',[offer('b','A',400,1000)])
 ]);
 assert.equal(result.complete,false);
 assert.equal(result.lines.length,0);
 assert.equal(result.unresolved.length,2);
});

test('malformed offers and missing supplier identities cannot be selected',()=>{
 const malformed=[null,undefined,{}, {...offer('a','A',100),supplier_id:''}, {...offer('b','B',100),id:null}];
 const r=prepareProcurement([item('s',malformed)]);
 assert.equal(r.complete,false);assert.equal(r.lines.length,0);assert.equal(r.unresolved.length,1);
 assert.equal(prepareProcurement([item('s',null)]).complete,false);
});

test('duplicate or invalid stock entries never create multiple purchase lines',()=>{
 const stock=item('stock',[offer('a','A',100)]);
 assert.throws(()=>prepareProcurement([stock,stock]),/Lagerposition/);
 assert.throws(()=>prepareProcurement([null]),/Lagerposition/);
 assert.throws(()=>prepareProcurement([item('',[offer('a','A',100)])]),/Lagerposition/);
 assert.throws(()=>prepareProcurement(null),/Einkaufsliste/);
});

test('empty procurement is never marked as approved',()=>{
 const result=prepareProcurement([]);
 assert.equal(result.complete,false);
 assert.deepEqual(result.lines,[]);
 assert.equal(result.netCents,0);
});
test('procurement refuses totals beyond supported money range',()=>{
 const result=prepareProcurement([
  item('s1',[offer('a','A',2147483647)]),
  item('s2',[offer('b','A',1)])
 ]);
 assert.equal(result.complete,false);
 assert.equal(result.lines.length,0);
});

test('offers without valid pack quantities or supplier names are not selected',()=>{
 for(const patch of [{pack_quantity:0},{pack_quantity:-1},{pack_quantity:'5'},{pack_quantity:null},{business_name:''},{name:''}]){
  const result=prepareProcurement([item('stock',[{...offer('a','A',500),...patch}])]);
  assert.equal(result.complete,false);
  assert.equal(result.lines.length,0);
 }
});

test('duplicate supplier offer identifiers require manual review',()=>{
 const r=prepareProcurement([item('stock',[offer('same','A',200),offer('same','B',100)])]);
 assert.equal(r.complete,false);
 assert.equal(r.lines.length,0);
 assert.match(r.unresolved[0].reason,/Angebotskennung/);
});

test('duplicate offer identifiers beyond the five cheapest still block approval',()=>{
 const offers=Array.from({length:6},(_,i)=>offer('offer-'+i,'A',100+i));
 offers.push(offer('offer-0','B',10000));
 const r=prepareProcurement([item('stock',offers)]);
 assert.equal(r.complete,false);
 assert.equal(r.lines.length,0);
 assert.match(r.unresolved[0].reason,/Angebotskennung/);
});

test('unrepresentable total is explicitly flagged for manual review',()=>{
 const result=prepareProcurement([item('a',[offer('a','A',2147483647)]),item('b',[offer('b','A',1)])]);
 assert.equal(result.complete,false);
 assert.equal(result.netCents,0);
 assert.equal(result.lines.length,0);
 assert.deepEqual(result.unresolved.map(x=>x.stockId),['a','b']);
 assert(result.unresolved.every(x=>/Gesamtbetrag/.test(x.reason)));
});

test('unmet minimum on one supplier cannot create a partially approved multi-supplier order',()=>{
 const result=prepareProcurement([
  item('first',[offer('a','A',100,1000)]),
  item('second',[offer('b','B',300,0)])
 ]);
 assert.equal(result.complete,false);
 assert.equal(result.lines.length,0);
 assert.equal(result.netCents,0);
 assert.deepEqual(result.unresolved.map(x=>x.stockId),['first','second']);
});

test('one unavailable stock item blocks the entire purchase proposal',()=>{
 const result=prepareProcurement([item('available',[offer('valid','A',500)]),item('unavailable',[])]);
 assert.equal(result.complete,false);
 assert.equal(result.lines.length,0);
 assert.equal(result.netCents,0);
 assert.deepEqual(new Set(result.unresolved.map(x=>x.stockId)),new Set(['available','unavailable']));
});

test('large procurement requests are rejected even without offers',()=>{
 const rows=Array.from({length:51},(_,i)=>item(String(i),[]));
 const result=prepareProcurement(rows);
 assert.equal(result.complete,false);
 assert.equal(result.lines.length,0);
 assert.equal(result.unresolved.length,51);
});

test('whitespace variants of stock identifiers cannot duplicate a purchase',()=>{
 assert.throws(()=>prepareProcurement([item('stock',[offer('a','A',100)]),item(' stock ',[offer('b','A',100)])]),/Lagerposition/);
});

test('supplier offer IDs with whitespace aliases require manual review',()=>{
 const result=prepareProcurement([item('stock',[offer('same','A',200),offer(' same ','B',100)])]);
 assert.equal(result.complete,false);
 assert.equal(result.lines.length,0);
 assert.match(result.unresolved[0].reason,/Angebotskennung/);
});

test('non-text supplier delivery regions never match implicitly',()=>{
 for(const region of [null,undefined,123,{},['Berlin']])assert.equal(deliveryMatches(region,'Berlin','10115'),false);
});

test('delivery city and postal code must be text, not coerced numbers',()=>{
 assert.equal(deliveryMatches('10115','',10115),false);
 assert.equal(deliveryMatches('123','',123),false);
 assert.equal(deliveryMatches('Berlin',{toString:()=> 'Berlin'},''),false);
 assert.equal(deliveryMatches('10115','', '10115'),true);
});

test('supplier address and city require nonempty text',()=>{
 for(const patch of [{address:42},{address:'  '},{city:10115},{city:'  '}]){
  const result=prepareProcurement([item('stock',[{...offer('a','A',100),...patch}])]);
  assert.equal(result.complete,false);
  assert.equal(result.lines.length,0);
 }
});

test('supplier IDs with surrounding whitespace share one minimum-order group',()=>{
 const result=prepareProcurement([
  item('first',[offer('a','A',600,1000)]),
  item('second',[offer('b',' A ',600,1000)])
 ]);
 assert.equal(result.complete,true);
 assert.equal(result.netCents,1200);
 assert.deepEqual(result.lines.map(line=>line.supplierId),['A','A']);
});

test('proposed purchase line uses trimmed offer identifier',()=>{
 const result=prepareProcurement([item('stock',[offer(' offer-1 ','A',100)])]);
 assert.equal(result.complete,true);
 assert.equal(result.lines[0].productId,'offer-1');
});

test('purchase lines use canonical stock identifiers',()=>{
 const result=prepareProcurement([item(' stock-1 ',[offer('offer-1','A',100)])]);
 assert.equal(result.complete,true);
 assert.equal(result.lines[0].stockId,'stock-1');
});

test('unresolved purchase items use canonical stock IDs',()=>{
 const missing=prepareProcurement([item(' missing ',[])]);
 assert.equal(missing.unresolved[0].stockId,'missing');
 const duplicate=prepareProcurement([item(' duplicate ',[offer('same','A',100),offer(' same ','B',100)])]);
 assert.equal(duplicate.unresolved[0].stockId,'duplicate');
 const overflow=prepareProcurement([item(' huge ',[offer('a','A',2147483647)]),item(' extra ',[offer('b','A',1)])]);
 assert.deepEqual(overflow.unresolved.map(x=>x.stockId),['huge','extra']);
});

test('Unicode-equivalent supplier offer IDs cannot bypass duplicate checks',()=>{
 const result=prepareProcurement([item('stock',[offer('offer-1','A',200),offer('ｏｆｆｅｒ-1','B',100)])]);
 assert.equal(result.complete,false);
 assert.equal(result.lines.length,0);
 assert.match(result.unresolved[0].reason,/Angebotskennung/);
});
