import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const renderSource=readFileSync(new URL('../apps/web/public/pos/app.js',import.meta.url),'utf8').split('\n').find(l=>l.startsWith('function render('));
function fixture(){
 const nodes=new Map();const $=id=>{if(!nodes.has(id)){let html='';nodes.set(id,{value:'',get innerHTML(){return html},set innerHTML(s){html=s;if(['restaurant','productCategory'].includes(id))this.value=s.match(/value="([^"]*)"/)?.[1]||''},querySelectorAll(){return []}})}return nodes.get(id)};
 $('restaurant').value='r1';$('productCategory').value='pizza';
 const context=vm.createContext({$,data:{restaurants:[{id:'r1',name:'Test'},{id:'r2',name:'Other'}],categories:[{id:'drinks',restaurantId:'r1',name:'Drinks'},{id:'pizza',restaurantId:'r1',name:'Pizza'},{id:'other',restaurantId:'r2',name:'Other'}],products:[{id:'cola',restaurantId:'r1',categoryId:'drinks',name:'Cola',price:3,emoji:''},{id:'p1',restaurantId:'r1',categoryId:'pizza',name:'Pizza',price:10,emoji:''}]},cat:'all',applyBusinessMode(){},renderCart(){},money:String,esc:String});vm.runInContext(renderSource,context);return {context,$};
}
test('render keeps the selected product category when all categories are rebuilt',()=>{const f=fixture();f.context.render();assert.equal(f.$('productCategory').value,'pizza');assert.match(f.$('productCategory').innerHTML,/Drinks/);assert.match(f.$('productCategory').innerHTML,/Pizza/);assert.doesNotMatch(f.$('productCategory').innerHTML,/Other/);f.context.render();assert.equal(f.$('productCategory').value,'pizza')});
test('category filter shows assigned products only',()=>{const f=fixture();f.context.cat='pizza';f.context.render();assert.match(f.$('products').innerHTML,/Pizza/);assert.doesNotMatch(f.$('products').innerHTML,/Cola/)});
test('switching restaurant drops a stale category filter',()=>{const f=fixture();f.context.cat='pizza';f.context.render('r2');assert.equal(f.context.cat,'all');assert.equal(f.$('productCategory').value,'other')});
