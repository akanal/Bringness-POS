import test from 'node:test';
import assert from 'node:assert/strict';
import {monthWindow,personnelReport} from './personnel-report.js';
const people=[{id:'one',display_name:'Ahmet'},{id:'two',display_name:'Mitarbeiter'}];
const event=(action,time,employee='one',extra={})=>({id:time,employee_id:employee,action,effective_at:time,recorded_at:time,...extra});
test('Berlin month boundaries include daylight saving changes',()=>{
 assert.equal(new Date(monthWindow('2026-03').from).toISOString(),'2026-02-28T23:00:00.000Z');
 assert.equal(new Date(monthWindow('2026-03').to).toISOString(),'2026-03-31T22:00:00.000Z');
 assert.equal(new Date(monthWindow('2026-10').to).toISOString(),'2026-10-31T23:00:00.000Z');
 assert.throws(()=>monthWindow('2026-13'));
});
test('shift breaks, employee isolation, corrections and monthly totals',()=>{
 const report=personnelReport([
 event('start','2026-10-01T06:00:00Z'),event('pause','2026-10-01T10:00:00Z'),
 event('resume','2026-10-01T10:30:00Z'),event('end','2026-10-01T14:30:00Z'),
 event('start','2026-10-02T08:00:00Z','two'),event('end','2026-10-02T10:00:00Z','two')
 ],people,'2026-10',Date.parse('2026-11-02T00:00:00Z'));
 assert.equal(report.totals[0].workMinutes,480);assert.equal(report.totals[0].pauseMinutes,30);
 assert.equal(report.totals[1].workMinutes,120);assert.equal(report.shifts.length,2);
});
test('overnight shifts crossing months are clipped without dropping carry-in',()=>{
 const report=personnelReport([event('start','2026-09-30T21:00:00Z'),event('end','2026-10-01T02:00:00Z')],people,'2026-10',Date.parse('2026-11-02'));
 assert.equal(report.totals[0].workMinutes,240);assert.equal(report.shifts[0].start,'2026-09-30T21:00:00.000Z');
});
test('running and paused shifts are provisional and count only elapsed work',()=>{
 const report=personnelReport([event('start','2026-10-01T06:00:00Z'),event('pause','2026-10-01T10:00:00Z')],people,'2026-10',Date.parse('2026-10-01T11:00:00Z'));
 assert.equal(report.totals[0].workMinutes,240);assert.equal(report.totals[0].pauseMinutes,60);assert.equal(report.totals[0].openShifts,1);assert.equal(report.shifts[0].end,null);
});
test('older historical month remains reportable',()=>{
 const report=personnelReport([event('start','2024-10-01T06:00:00Z'),event('end','2024-10-01T14:00:00Z')],people,'2024-10');
 assert.equal(report.totals[0].workMinutes,480);
});
