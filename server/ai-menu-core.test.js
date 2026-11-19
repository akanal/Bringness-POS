import test from 'node:test';import assert from 'node:assert/strict';
import {normalizeMenu,menuSuggestions,menuDigest} from './ai-menu-core.js';
const recipeId='12345678-1234-4234-8234-123456789abc';
const item={recipeId,name:'Suppe',category:'Vorspeisen',description:'',priceCents:650,visible:true};
test('menu validates exact prices, recipe uniqueness and bounded content',()=>{
 assert.deepEqual(normalizeMenu({title:' Karte ',items:[item]}),{title:'Karte',items:[item]});
 for(const priceCents of [undefined,-1,1.2,NaN,Infinity,'650',10000001])assert.throws(()=>normalizeMenu({title:'Karte',items:[{...item,priceCents}]}));
 assert.throws(()=>normalizeMenu({title:'Karte',items:[item,item]}));assert.throws(()=>normalizeMenu({title:'Karte',items:[]}));
 assert.equal(normalizeMenu({title:'Karte',items:[{...item,priceCents:null}]}).items[0].priceCents,null);
 assert.throws(()=>normalizeMenu({title:'Karte',items:[{...item,description:'a'.repeat(601)}]}));
});
test('menu advice marks missing costs and scarce unreserved stock without invented prices',()=>{
 const r=menuSuggestions([{id:recipeId,name:'Suppe',active:true,cost:{complete:false,netCents:null},items:[{quantity:2,stock_quantity:3,reserved_quantity:2}]}])[0];
 assert(r.notes.some(n=>n.includes('unvollständig')));assert(r.notes.some(n=>n.includes('Freier Bestand')));assert.equal(r.priceCents,undefined);
 assert.notEqual(menuDigest(item),menuDigest({...item,priceCents:700}));
});
