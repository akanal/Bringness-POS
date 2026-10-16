import test from 'node:test';
import assert from 'node:assert/strict';
import {markTransactionSigned} from '../server/tse-core.js';

test('signed transition requires finishing state',async()=>{
 let sql;
 const db={query:async(statement)=>{sql=statement;return {rows:[]}}};
 const result=await markTransactionSigned(db,'tx',{transactionNumber:'42'});
 assert.equal(result,null);
 assert.match(sql,/WHERE id=\$1 AND state='finishing' RETURNING \*/);
});
test('signed transition returns updated row when finishing',async()=>{
 const row={id:'tx',state:'signed'};
 const db={query:async()=>({rows:[row]})};
 assert.deepEqual(await markTransactionSigned(db,'tx',{transactionNumber:'42'}),row);
});
