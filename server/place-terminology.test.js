import test from 'node:test';
import assert from 'node:assert/strict';
import {placeTerms,placeName} from './place-terminology.js';
test('place terms accept explicit singular/plural and reject markup, control characters and missing forms',()=>{
 assert.deepEqual(placeTerms({singular:' Zimmer ',plural:'Zimmer'}),{singular:'Zimmer',plural:'Zimmer'});
 assert.deepEqual(placeTerms({singular:'Platz',plural:'Plätze'}),{singular:'Platz',plural:'Plätze'});
 for(const value of [{singular:'Zimmer'}, {singular:'<img>',plural:'Zimmer'},{singular:'A\nB',plural:'B'}, {singular:'A'.repeat(31),plural:'B'}, {singular:2,plural:'B'}])assert.throws(()=>placeTerms(value),e=>e.status===400);
});
test('only numeric identifiers and the previous generic prefix are renamed; custom names survive',()=>{
 for(const [input,old,next,expected] of [['1','Tisch','Zimmer','Zimmer 1'],['101','Tisch','Tisch','101'],['Tisch 12','Tisch','Zimmer','Zimmer 12'],['Zimmer 101','Zimmer','Platz','Platz 101'],['Balkon 1','Zimmer','Platz','Balkon 1'],['Tischlerei','Tisch','Zimmer','Tischlerei']])assert.equal(placeName(input,old,next),expected);
});
