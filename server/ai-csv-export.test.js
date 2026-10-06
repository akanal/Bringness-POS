import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const context=vm.createContext({});
vm.runInContext(fs.readFileSync(new URL('../apps/web/public/ai-csv-export.js',import.meta.url),'utf8'),context);
const csv=context.BringnessCsv.serialize;
test('German CSV retains umlauts, decimal commas and quoted separators',()=>{
 assert.equal(csv([['Zutat','Menge'],['Öl; "fein"','1,25']]),'\uFEFF"Zutat";"Menge"\r\n"Öl; ""fein""";"1,25"\r\n');
});
test('untrusted names cannot become spreadsheet formulas',()=>{
 for(const name of ['=1+1','+SUM(A1)','-1+1','@SUM(A1)','  =1','\t=1','\n=1']) assert.ok(csv([[name]]).startsWith('\uFEFF"\''));
 assert.equal(csv([[null,0,'Kartoffeln']]),'\uFEFF"";"0";"Kartoffeln"\r\n');
});
