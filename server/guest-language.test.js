import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
const source=fs.readFileSync(new URL('../apps/web/public/tisch/language.js',import.meta.url),'utf8');
function mount({saved=null,languages=['de'],blocked=false}={}){
 const document={documentElement:{},querySelectorAll:()=>[]},window={addEventListener(){}};
 const store={getItem(){if(blocked)throw Error('blocked');return saved},setItem(key,value){if(blocked)throw Error('blocked');saved=value}};
 vm.runInNewContext(source,{window,document,localStorage:store,navigator:{languages,language:languages[0]}});
 return {api:window.BringnessGuestLanguage,document,saved:()=>saved};
}
test('guest language uses ordered supported browser preferences and normalizes regional tags',()=>{
 assert.equal(mount({languages:['ja-JP','tr-TR','en-US']}).api.language,'tr');
 assert.equal(mount({languages:['EN_us']}).api.language,'en');
 assert.equal(mount({languages:['ja']}).api.language,'de');
});
test('explicit preference wins, is persisted and changes the document language',()=>{
 const m=mount({saved:'de',languages:['tr']});assert.equal(m.api.language,'de');
 m.api.set('en');assert.equal(m.saved(),'en');assert.equal(m.document.documentElement.lang,'en');assert.equal(m.api.t('Deine Bestellung'),'Your order');
 assert.equal(mount({saved:'bad',languages:['fr']}).api.language,'fr');
});
test('blocked storage still permits automatic language and a manual session override',()=>{
 const m=mount({blocked:true,languages:['tr']});assert.equal(m.api.language,'tr');m.api.set('de');assert.equal(m.api.language,'de');
});
test('all nine existing guest languages translate core controls without translating business records',()=>{
 const m=mount();for(const lang of ['en','fr','es','it','tr','el','nl','pl']){m.api.set(lang);for(const text of ['Deine Bestellung','Verbindlich bestellen','Zutaten:','Menge reduzieren','Für eine neue Bestellung bitte den QR-Code erneut scannen.'])assert.notEqual(m.api.t(text),text)}
 assert.equal(m.api.t('Restaurant Bella'),'Restaurant Bella');
});
