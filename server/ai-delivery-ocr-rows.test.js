import test from 'node:test';
import assert from 'node:assert/strict';
import {sparseRows,selectOcrPass} from './ai-delivery-ocr-rows.js';
import {textDraft,suggestDelivery} from './ai-delivery-core.js';
const line=(text,x0,y0,x1,y1)=>({text,bbox:{x0,y0,x1,y1}});
const blocks=lines=>[{paragraphs:[{lines}]}];
test('sparse OCR joins observed horizontal fragments and keeps separate/overlapping rows',()=>{
 const input=blocks([line('3,00 Stk',300,99,360,113),line('Musterware',10,100,100,114),line('Andere Ware',10,140,100,154),line('2 kg',300,140,360,154),line('overlap',20,101,80,113)]);
 const rows=sparseRows(input).split('\n');assert(rows.includes('Musterware 3,00 Stk'));assert(rows.includes('Andere Ware 2 kg'));assert(rows.includes('overlap'));assert.equal(rows.length,3);
});
test('fallback requires improved confidence and preserves every existing quantity/unit occurrence',()=>{
 const primary={text:'OS 1. Musterware 3 Stk\nWeitere Ware 2 kg',confidence:49};
 const secondary={confidence:59,blocks:blocks([line('Musterware 3 Stk',0,0,200,15),line('Weitere Ware 2 kg',0,40,200,55)])};
 const result=selectOcrPass(primary,secondary);assert.equal(result.method,'sparse-rows');assert.equal(result.originalText,primary.text);
 assert.equal(selectOcrPass(primary,{...secondary,confidence:50}).text,primary.text);
 for(const text of ['Musterware 4 Stk','Musterware 3 Stk','Musterware 3 kg\nWeitere Ware 2 kg'])assert.equal(selectOcrPass(primary,{confidence:90,blocks:blocks([line(text,0,0,200,15)])}).text,primary.text);
 assert.equal(selectOcrPass({...primary,text:'A 3 Stk\nB 3 Stk'},secondary).method,'auto');
 assert.equal(selectOcrPass(primary,{confidence:99,blocks:[]}).method,'auto');
});
test('reconstructed goods allow exact suggestions only and labelled dates remain unambiguous',()=>{
 const draft=textDraft('Empfänger Lieferdatum 18.10.2026\nMusterware 3 Stk 2,00 EUR 6,00 EUR',59);
 assert.equal(draft.metadata.deliveryDate,'2026-10-18');assert.match(draft.warning,/teilweise unsicher/);
 const row=suggestDelivery(draft,[{id:'s',name:'Musterware',unit:'piece'}]).lines[1];assert.equal(row.stockId,'s');assert.equal(row.reviewed,false);assert.equal(row.netCents,null);
 assert.equal(textDraft('Lieferdatum 18.10.2026\nLieferdatum 19.10.2026').metadata.deliveryDate,'');
 assert.equal(textDraft('Lieferdatum 31.02.2026').metadata.deliveryDate,'');
 assert.equal(textDraft('Rechnungsdatum 18.10.2026').metadata.deliveryDate,'');
});

test('previous OCR text survives draft refresh without becoming duplicate stock lines',()=>{const first=textDraft('Musterware 3 Stk',59,'OS 1. Musterware 3 Stk');const restored=textDraft(first.text,first.confidence,first.originalText);assert.equal(restored.originalText,first.originalText);assert.equal(restored.lines.length,1);assert.equal(restored.lines[0].reviewed,false);});
