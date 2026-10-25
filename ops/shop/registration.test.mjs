import {test} from 'node:test';import assert from 'node:assert/strict';import crypto from 'node:crypto';
import {fixture} from './fixture.mjs';import {migrateShopRegistration,registerShopAccount,normalizedShopRegistration} from '../../server/shop-registration.js';
import {issueLoginSession} from '../../server/login-session.js';
import {readShopPreview} from '../../server/shop-account.js';
import {legacyPasswordHash} from '../../server/secret-derivation.js';
const registration={companyName:'Fixture Shop GmbH',ownerName:'Fixture Owner',email:'new-owner@example.test',password:'Valid1!',street:'Example 2',postalCode:'10115',city:'Berlin',country:'DE'};
async function setup(){const f=await fixture();await f.db.exec("ALTER TABLE companies ADD COLUMN name text;ALTER TABLE users ADD COLUMN password_hash text;ALTER TABLE company_billing_profiles ADD COLUMN contact_name text;UPDATE users SET email=id::text||'@fixture.test';CREATE UNIQUE INDEX registration_email_unique ON users(email);");await migrateShopRegistration(f.pool);const request={enabled:true,requestId:crypto.randomUUID(),registration,hashPassword:async p=>crypto.createHash('sha512').update(p).digest('hex')};return {...f,request,run:(extra={})=>registerShopAccount(f.pool,{...request,...extra})};}
test('registration stays disabled without database or password work',async()=>{await assert.rejects(registerShopAccount({connect(){assert.fail('no database');}},{hashPassword(){assert.fail('no hash');}}),{code:'REGISTRATION_DISABLED'});});
test('registration rejects unknown fields and malformed input before hashing',async()=>{
 for(const patch of [{ownerName:''},{companyName:'x'},{email:'@'},{email:'a@@b.test'},{email:'a@b.test\n'},{password:'weak'},{ownerName:'x'.repeat(101)},{street:'Bad\nStreet'},{role:'admin'},{country:42}])await assert.rejects(registerShopAccount({}, {enabled:true,requestId:crypto.randomUUID(),registration:{...registration,...patch},hashPassword:()=>assert.fail('no hash')}),{code:'INVALID_REGISTRATION'});
 const normal=normalizedShopRegistration({...registration,companyName:'  Müller & Söhne  ',email:' Owner+shop@Example.test '});assert.equal(normal.companyName,'Müller & Söhne');assert.equal(normal.email,'owner+shop@example.test');
});
test('atomic registration keeps distinct company owner and billing data without sessions or grants',async()=>{
 const f=await setup();try{const first=await f.run();assert.equal(first.replay,false);assert.equal(first.loginRequired,true);assert.equal(first.canActivate,false);assert.deepEqual(await f.run(),{...first,replay:true});assert.deepEqual(await f.run({requestId:f.request.requestId.toUpperCase()}),{...first,replay:true});
  const user=(await f.db.query('SELECT * FROM users WHERE email=$1',[registration.email])).rows[0],company=(await f.db.query('SELECT name FROM companies WHERE id=$1',[user.company_id])).rows[0],billing=(await f.db.query('SELECT * FROM company_billing_profiles WHERE company_id=$1',[user.company_id])).rows[0];
  assert.equal(user.display_name,registration.ownerName);assert.equal(user.role,'owner');assert.equal(company.name,registration.companyName);assert.equal(billing.company_name,registration.companyName);assert.equal(billing.contact_name,registration.ownerName);assert.equal(billing.postal_code,'10115');
  assert.equal((await f.db.query('SELECT 1 FROM sessions WHERE user_id=$1',[user.id])).rows.length,0);for(const table of ['billing_transactions','company_entitlements','company_features'])assert.equal((await f.db.query('SELECT 1 FROM '+table)).rows.length,0);
  const journal=(await f.db.query('SELECT * FROM shop_registration_requests')).rows;for(const secret of [registration.password,registration.email,registration.street,user.password_hash])assert.ok(!JSON.stringify(journal).includes(secret));assert.ok(!JSON.stringify(first).includes(user.id));
 }finally{await f.db.close();}
});
test('every registration write rolls back together and explicitly retries once',async()=>{
 const f=await setup();try{for(const prefix of ['INSERT INTO companies','INSERT INTO users','INSERT INTO company_billing_profiles','INSERT INTO shop_registration_requests']){
  const faulty={...f.pool,connect:async()=>{const db=await f.pool.connect();return {...db,query(sql,args){if(sql.startsWith(prefix))throw Error('private failure');return db.query(sql,args);}};}};
  await assert.rejects(registerShopAccount(faulty,f.request),e=>e.code==='REGISTRATION_UNAVAILABLE'&&!e.message.includes('private'));assert.equal((await f.db.query('SELECT 1 FROM companies')).rows.length,2);assert.equal((await f.db.query('SELECT 1 FROM shop_registration_requests')).rows.length,0);assert.equal((await f.db.query('SELECT 1 FROM users WHERE email=$1',[registration.email])).rows.length,0);
 }assert.equal((await f.run()).replay,false);assert.equal((await f.run()).replay,true);}finally{await f.db.close();}
});
test('replays bind complete input and cannot restore blocked or deleted users',async()=>{
 const f=await setup();try{await f.run();for(const patch of [{password:'Different1!'},{email:'other@example.test'},{companyName:'Changed Company'},{ownerName:'Changed Owner'},{street:'Changed 3'}])await assert.rejects(f.run({registration:{...registration,...patch}}),{code:'REQUEST_CONFLICT'});
  await assert.rejects(f.run({requestId:crypto.randomUUID()}),{code:'EMAIL_UNAVAILABLE'});await f.db.query("UPDATE users SET status='blocked' WHERE email=$1",[registration.email]);await assert.rejects(f.run(),{code:'REGISTRATION_REVIEW'});await f.db.query('DELETE FROM users WHERE email=$1',[registration.email]);await assert.rejects(f.run(),{code:'REGISTRATION_REVIEW'});assert.equal((await f.db.query('SELECT 1 FROM companies')).rows.length,3);
 }finally{await f.db.close();}
});
test('hash capacity/errors fail before database writes and existing case variants cannot duplicate',async()=>{
 const f=await setup();try{await assert.rejects(f.run({hashPassword:async()=>{throw Error('private pepper');}}),{code:'REGISTRATION_UNAVAILABLE'});await assert.rejects(f.run({hashPassword:async()=> 'bad'}),{code:'REGISTRATION_UNAVAILABLE'});await assert.rejects(registerShopAccount({connect:async()=>{throw Error('private database location');}},f.request),e=>e.code==='REGISTRATION_UNAVAILABLE'&&!e.message.includes('private'));
  await f.db.query("UPDATE users SET email=' Existing@Example.test ' WHERE id=(SELECT id FROM users LIMIT 1)");await assert.rejects(f.run({registration:{...registration,email:'existing@example.test'}}),{code:'EMAIL_UNAVAILABLE'});assert.equal((await f.db.query('SELECT 1 FROM shop_registration_requests')).rows.length,0);
 }finally{await f.db.close();}
});
test('default password derivation stays compatible with existing login hashing',async()=>{
 const f=await setup();try{await f.run({hashPassword:undefined});const user=(await f.db.query('SELECT id,password_hash FROM users WHERE email=$1',[registration.email])).rows[0];assert.equal(user.password_hash,await legacyPasswordHash(registration.password));const token=await issueLoginSession(f.pool,{userId:user.id,passwordHash:await legacyPasswordHash(registration.password),role:'owner'});assert.match(token,/^[a-f0-9]{64}$/);const quote=await readShopPreview(f.pool,{token,cart:{'pos-online':1}});assert.equal(quote.account.profileComplete,true);assert.deepEqual(quote.issues,[]);assert.equal(quote.canActivate,false);}finally{await f.db.close();}
});
test('a lost commit acknowledgement recovers the same registration without another company',async()=>{
 const f=await setup();try{
  const pool={...f.pool,connect:async()=>{const db=await f.pool.connect();return {...db,query:async(sql,args)=>{const result=await db.query(sql,args);if(sql==='COMMIT')throw Error('commit acknowledgement lost');return result;}};}};
  await assert.rejects(registerShopAccount(pool,f.request),{code:'REGISTRATION_UNAVAILABLE'});assert.equal((await f.db.query('SELECT 1 FROM shop_registration_requests')).rows.length,1);
  assert.equal((await f.run()).replay,true);assert.equal((await f.db.query('SELECT 1 FROM companies')).rows.length,3);assert.equal((await f.db.query('SELECT 1 FROM users WHERE email=$1',[registration.email])).rows.length,1);
 }finally{await f.db.close();}
});
