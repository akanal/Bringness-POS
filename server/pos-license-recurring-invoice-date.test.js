import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeSandboxInvoiceDate} from './pos-license-recurring-invoice-date.js';
test('accepts ISO calendar date',()=>assert.equal(normalizeSandboxInvoiceDate('2026-10-16').toISOString().slice(0,10),'2026-10-16'));
test('rejects impossible date',()=>assert.equal(normalizeSandboxInvoiceDate('2026-02-30'),null));
test('rejects ambiguous localized date',()=>assert.equal(normalizeSandboxInvoiceDate('16.10.2026'),null));
test('rejects nondate value',()=>assert.equal(normalizeSandboxInvoiceDate({}),null));
