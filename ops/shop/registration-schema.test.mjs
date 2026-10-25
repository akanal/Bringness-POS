import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './fixture.mjs';
import {inspectShopRegistrationSchema} from '../../server/shop-registration-schema.js';
import {migrateShopRegistration} from '../../server/shop-registration.js';
import {createShopRegistrationRuntime} from '../../server/shop-registration-http.js';
import {registrationMetadataQuery} from './registration-schema-fixture.mjs';
const metadata=async()=> (await registrationMetadataQuery('information_schema.columns')).rows;
const inspect=rows=>inspectShopRegistrationSchema({query:async()=>({rows})},{enabled:true});
test('schema diagnostic is strictly opt-in and inert by default',async()=>{
 const db={query(){assert.fail('disabled schema query');}};
 for(const enabled of [undefined,false,'true',1])assert.deepEqual(await inspectShopRegistrationSchema(db,{enabled}),{enabled:false,compatible:false,issues:[]});
});
test('metadata query is parameterized and reads no user account data',async()=>{
 let calls=0;const result=await inspectShopRegistrationSchema({async query(sql,params){calls++;assert.match(sql,/information_schema\.columns/);assert.match(sql,/table_schema=current_schema\(\)/);assert.match(sql,/ANY\(\$1::text\[\]\)/);assert.deepEqual(params,[['companies','users','company_billing_profiles']]);assert.doesNotMatch(sql,/SELECT \*|password_hash FROM|INSERT|UPDATE|DELETE|CREATE/);return registrationMetadataQuery(sql);}},{enabled:true});assert.equal(result.compatible,true);assert.equal(calls,1);
});
test('missing tables or columns are individually identified without values',async()=>{
 const rows=await metadata();let r=await inspect([]);assert.equal(r.compatible,false);assert.ok(r.issues.every(i=>i.code==='MISSING_COLUMN'));
 r=await inspect(rows.filter(i=>i.column_name!=='contact_name'));assert.deepEqual(r.issues,[{table:'company_billing_profiles',column:'contact_name',code:'MISSING_COLUMN'}]);
});
test('wrong identity and address types are not accepted as compatible',async()=>{
 for(const [table,column,type] of [['companies','id','text'],['users','company_id','integer'],['users','password_hash','bytea'],['company_billing_profiles','postal_code','integer']]){
  const rows=await metadata();Object.assign(rows.find(r=>r.table_name===table&&r.column_name===column),{data_type:type});const result=await inspect(rows);assert.deepEqual(result.issues,[{table,column,code:'UNSUPPORTED_TYPE'}]);
 }
});
test('bounded character columns must accommodate accepted registration input',async()=>{
 const rows=await metadata(),row=rows.find(r=>r.table_name==='users'&&r.column_name==='email');Object.assign(row,{data_type:'character varying',character_maximum_length:253});assert.equal((await inspect(rows)).issues[0].code,'TEXT_CAPACITY');row.character_maximum_length=254;assert.equal((await inspect(rows)).compatible,true);row.character_maximum_length=null;assert.equal((await inspect(rows)).compatible,true);
});
test('extra mandatory columns without defaults block inserts while ordinary optional defaults do not',async()=>{
 const rows=await metadata(),extra={table_name:'users',column_name:'legacy_required',data_type:'text',character_maximum_length:null,is_nullable:'NO',column_default:null,is_identity:'NO',is_generated:'NEVER'};rows.push(extra);assert.deepEqual((await inspect(rows)).issues,[{table:'users',column:'legacy_required',code:'REQUIRED_EXTRA_COLUMN'}]);
 for(const patch of [{is_nullable:'YES'},{column_default:"'default'::text"},{is_identity:'YES'},{is_generated:'ALWAYS'}]){Object.assign(extra,{is_nullable:'NO',column_default:null,is_identity:'NO',is_generated:'NEVER'},patch);assert.equal((await inspect(rows)).compatible,true);}
});
test('generated and always-identity input columns are refused',async()=>{
 for(const patch of [{is_generated:'ALWAYS'},{is_identity:'YES',identity_generation:'ALWAYS'}]){const rows=await metadata();Object.assign(rows.find(r=>r.table_name==='companies'&&r.column_name==='id'),patch);assert.equal((await inspect(rows)).issues[0].code,'NON_WRITABLE_COLUMN');}
});
test('database errors and malformed metadata yield only sanitized diagnostic errors',async()=>{
 for(const db of [{query:async()=>{throw Error('private connection string');}},{query:async()=>({rows:[null]})},{query:async()=>({rows:[{table_name:'users'}]})},{query:async()=>undefined}])await assert.rejects(inspectShopRegistrationSchema(db,{enabled:true}),e=>e.code==='REGISTRATION_SCHEMA_UNAVAILABLE'&&e.message==='REGISTRATION_SCHEMA_UNAVAILABLE');
});
test('incompatible metadata stops migration before any CREATE and exposes no details in its error',async()=>{
 let calls=0;await assert.rejects(migrateShopRegistration({async query(sql){calls++;assert.match(sql,/information_schema/);return {rows:[]};}}),{code:'REGISTRATION_SCHEMA_NOT_READY'});assert.equal(calls,1);
});
test('actual incomplete database stays closed; repaired prerequisite schema enables explicit migration retry',async()=>{
 const f=await fixture(),runtime=createShopRegistrationRuntime(f.pool,{enabled:true,publicOrigin:'https://fixture.example.test'});
 const res=()=>({writeHead(status){this.status=status;},end(body){this.value=JSON.parse(body);}});
 try{
  await assert.rejects(runtime.migrate(),{code:'REGISTRATION_SCHEMA_NOT_READY'});assert.equal((await f.db.query("SELECT 1 FROM information_schema.tables WHERE table_name='shop_registration_requests'")).rows.length,0);
  const closed=res();await runtime.handle({url:'/api/v1/shop/registrations',method:'POST',headers:{origin:'https://fixture.example.test'}},closed);assert.equal(closed.status,503);assert.deepEqual(closed.value,{code:'REGISTRATION_NOT_READY'});
  await f.db.exec('ALTER TABLE companies ADD COLUMN name text;ALTER TABLE users ADD COLUMN password_hash text;ALTER TABLE company_billing_profiles ADD COLUMN contact_name text;');
  assert.equal((await inspectShopRegistrationSchema(f.pool,{enabled:true})).compatible,true);await Promise.all([runtime.migrate(),runtime.migrate()]);
  const ready=res();await runtime.handle({url:'/api/v1/shop/registrations',method:'POST',headers:{origin:'https://fixture.example.test'}},ready);assert.equal(ready.status,400);
  assert.equal((await f.db.query('SELECT 1 FROM shop_registration_requests')).rows.length,0);assert.equal((await f.db.query('SELECT 1 FROM companies')).rows.length,2);
 }finally{await f.db.close();}
});
