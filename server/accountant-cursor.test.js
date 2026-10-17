import {test} from 'node:test';import assert from 'node:assert/strict';import {decodeAccountantCursor} from './accountant-cursor.js';
const c={binding:'fixture',id:'11111111-1111-4111-8111-111111111111',date:'2026-01-01T10:00:00.123456Z',asOf:'2026-10-17T07:00:00.123456Z'},encode=v=>Buffer.from(JSON.stringify(v)).toString('base64url');
test('accountant cursor bounds bytes and retains microseconds while rejecting normalized impossible dates',()=>{
 assert.deepEqual(decodeAccountantCursor(encode(c),'fixture'),c);
 for(const raw of ['a'.repeat(769),encode(c)+'!',encode({...c,binding:'other'}),encode({...c,date:'2026-02-30T10:00:00.123Z'}),encode({...c,asOf:'2099-01-01T00:00:00.000Z'}),encode(null)])assert.throws(()=>decodeAccountantCursor(raw,'fixture'),e=>e.status===400);
});
