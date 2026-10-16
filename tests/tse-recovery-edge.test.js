import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyTseRecovery} from '../server/tse-recovery.js';
const now=new Date('2026-10-16T08:00:00Z');
test('invalid timestamp requires manual review',()=>assert.equal(classifyTseRecovery({state:'starting',updated_at:'invalid'},now).action,'manual_review'));
test('unknown state requires manual review',()=>assert.equal(classifyTseRecovery({state:'mystery'},now).action,'manual_review'));
test('failed transaction requires manual review',()=>assert.equal(classifyTseRecovery({state:'failed'},now).action,'manual_review'));
test('exact staleness threshold requires review',()=>assert.equal(classifyTseRecovery({state:'finishing',updated_at:'2026-10-16T07:55:00Z'},now).action,'manual_review'));
test('missing transaction is rejected',()=>assert.throws(()=>classifyTseRecovery(null,now),TypeError));
