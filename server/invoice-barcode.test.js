import test from 'node:test';
import assert from 'node:assert/strict';
import {invoiceBarcode} from './invoice-barcode.js';
test('invoice barcode retains exact number and quiet zones in a bounded vector symbol',()=>{
 const bars=[],doc={save(){return this},restore(){return this},fillColor(){return this},rect(...args){bars.push(args);return this},fill(){return this}};
 for(const value of ['HR-2026-000001','RE-1537']){
  bars.length=0;const result=invoiceBarcode(doc,value);assert.equal(result.value,value);assert(result.width<=240);assert(result.module>=0.5);assert(bars.length>20);assert(bars.every(([x,y,w,h])=>x>=result.x+10*result.module&&y===126&&w>0&&h===20));
  const last=bars.at(-1);assert(Math.abs(result.x+result.width-(last[0]+last[2])-10*result.module)<0.001);
 }
 for(const value of ['',null,'HR\n001','ü-001','A'.repeat(81)])assert.throws(()=>invoiceBarcode(doc,value));
});
