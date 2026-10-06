import test from 'node:test';
import assert from 'node:assert/strict';
import {textDraft,parseDeliveryLine,suggestDelivery,normalizeName} from './ai-delivery-core.js';
test('labelled document headers, actual pack multiplication and explicitly net line totals',()=>{
 const r=textDraft('Lieferant: Frische GmbH\nLieferschein Nr. LS-123\nLieferdatum: 04.10.2026\nMehl 3 x 1 kg Positionswert netto 6,00 EUR');
 assert.deepEqual(r.metadata,{supplier:'Frische GmbH',reference:'LS-123',deliveryDate:'2026-10-04'});assert(r.lines.slice(0,3).every(l=>l.header));assert.equal(r.lines[3].quantity,3);assert.equal(r.lines[3].packQuantity,1);assert.equal(r.lines[3].netCents,600);assert.equal(r.lines[3].reviewed,false);
 assert.equal(parseDeliveryLine('Milch 6 Packungen à 500 ml').quantity,3);assert.equal(parseDeliveryLine('Milch 6 Packungen à 500 ml').packQuantity,.5);
 assert.equal(parseDeliveryLine('Mehl 2 kg 6,00 EUR').netCents,null);assert.equal(parseDeliveryLine('Mehl 2 kg Einzelpreis netto 6,00 EUR').netCents,null);assert.equal(textDraft('Datum: 31.02.2026\nMehl 2 kg Lieferant Berlin').metadata.deliveryDate,'');
});
test('exact names and confirmed vendor aliases propose matches, but ambiguous and wrong units stay open',()=>{
 const draft=textDraft('Lieferant: Frische GmbH\nMehl 2 kg\nWeizenmehl fein 3 kg');const stock=[{id:'one',name:'Mehl',unit:'kg'},{id:'two',name:'Milch',unit:'l'}];
 const mappings=[{supplier_key:normalizeName('Frische GmbH'),source_key:'weizenmehl fein',stock_id:'one',pack_quantity:1}];
 const r=suggestDelivery(draft,stock,mappings);assert.equal(r.lines[1].stockId,'one');assert.equal(r.lines[2].stockId,'one');assert.equal(r.lines[2].packQuantity,1);assert.match(r.lines[2].packBasis,/letzter/);assert.equal(r.lines[2].reviewed,false);
 assert.equal(suggestDelivery(draft,[...stock,{id:'duplicate',name:'Mehl',unit:'kg'}]).lines[1].stockId,'');
 assert.equal(suggestDelivery(draft,[{id:'one',name:'Mehl',unit:'l'}],mappings).lines[1].stockId,'');
 assert.equal(suggestDelivery(textDraft('Lieferant: Andere GmbH\nWeizenmehl fein 3 kg'),stock,mappings).lines[1].stockId,'');
 assert.equal(suggestDelivery(draft,[{id:'other',name:'Andere Zutat',unit:'kg'}],mappings).lines[2].stockId,'');
});
test('only one previously confirmed vendor in document can fill absent supplier',()=>{
 const draft=textDraft('Frische GmbH\nLieferschein 123456\nMehl 3 kg');assert.equal(suggestDelivery(draft,[],[],['Frische GmbH']).metadata.supplier,'Frische GmbH');
 assert.equal(suggestDelivery(textDraft('Frische GmbH Andere GmbH\nMehl 3 kg'),[],[],['Frische GmbH','Andere GmbH']).metadata.supplier,'');
});
