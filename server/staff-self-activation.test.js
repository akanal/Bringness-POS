import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {PGlite} from './ai-tests/node_modules/@electric-sql/pglite/dist/index.js';
import {activateStaff,createStaffInvitation,resendStaffInvitation} from './staff-self-activation.js';
import {pinMatches} from './personnel.js';
const digest=x=>crypto.createHash('sha256').update(x).digest('hex');
async function fixture(role='waiter'){
 const db=new PGlite();await db.exec(`CREATE TABLE users(id text PRIMARY KEY,role text,status text,password_hash text,must_change_password boolean); CREATE TABLE employees(id text PRIMARY KEY,user_id text,active boolean,pin_hash text); CREATE TABLE sessions(user_id text); CREATE TABLE staff_invitations(token_hash text PRIMARY KEY,user_id text,used_at timestamptz,expires_at timestamptz,self_setup boolean);`);
 const token='a'.repeat(64);await db.query("INSERT INTO users VALUES('u',$1,'pending','unshared',true)",[role]);await db.exec("INSERT INTO employees VALUES('e','u',true,null);INSERT INTO sessions VALUES('u')");await db.query("INSERT INTO staff_invitations VALUES($1,'u',null,now()+interval '48 hours',true)",[digest(token)]);
 const pool={connect:async()=>({query:(...args)=>db.query(...args),release(){}})};return {db,pool,token};
}
for(const role of ['waiter','cashier','kitchen','manager'])test(role+' self setup preserves role, sets PIN, consumes invitation and rejects reuse',async()=>{
 const {db,pool,token}=await fixture(role);try{
 const details=await activateStaff(pool,{token},true);assert.equal(details.credentialType,role==='waiter'?'pin':'password');assert.equal((await db.query('SELECT used_at FROM staff_invitations')).rows[0].used_at,null);
 const password=role==='waiter'?'012345':'Secure1!';await activateStaff(pool,{token,password,stampPin:'123456'});
 const u=(await db.query('SELECT * FROM users')).rows[0];assert.equal(u.status,'active');assert.equal(u.role,role);assert.equal(u.must_change_password,false);assert.notEqual(u.password_hash,'unshared');assert.equal(pinMatches(role==='waiter'?password:'123456',(await db.query('SELECT pin_hash FROM employees')).rows[0].pin_hash),true);assert.equal((await db.query('SELECT * FROM sessions')).rows.length,0);
 await assert.rejects(activateStaff(pool,{token,password,stampPin:'123456'}),/ungültig/);
 }finally{await db.close()}
});
test('invalid credentials roll back without consuming link; expired, disabled and legacy invitations rejected',async()=>{
 const {db,pool,token}=await fixture('cashier');try{
 for(const input of [{password:'weak',stampPin:'123456'},{password:'Secure1!',stampPin:'short'}])await assert.rejects(activateStaff(pool,{token,...input}));
 assert.equal((await db.query('SELECT status FROM users')).rows[0].status,'pending');assert.equal((await db.query('SELECT used_at FROM staff_invitations')).rows[0].used_at,null);
 await db.exec("UPDATE staff_invitations SET expires_at=now()-interval '1 second'");await assert.rejects(activateStaff(pool,{token},true));
 await db.exec("UPDATE staff_invitations SET expires_at=now()+interval '1 day',self_setup=false");await assert.rejects(activateStaff(pool,{token},true));
 await db.exec("UPDATE staff_invitations SET self_setup=true;UPDATE users SET status='disabled'");await assert.rejects(activateStaff(pool,{token},true));
 }finally{await db.close()}
});

test('email invitation contains no shared credential; resend stays scoped and replaces old links',async()=>{
 Object.assign(process.env,{SMTP_HOST:'smtp.example.test',SMTP_USER:'test',SMTP_PASSWORD:'test-only',SMTP_FROM:'test@example.test'});
 const db=new PGlite();try{
 await db.exec("CREATE TABLE users(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid,email text UNIQUE,password_hash text,display_name text,status text,role text,must_change_password boolean);CREATE TABLE restaurants(id uuid PRIMARY KEY,company_id uuid,name text);CREATE TABLE employees(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),restaurant_id uuid,display_name text,role text,active boolean,user_id uuid,pin_hash text);CREATE TABLE staff_invitations(token_hash text PRIMARY KEY,user_id uuid,expires_at timestamptz,used_at timestamptz,self_setup boolean,created_at timestamptz DEFAULT now());CREATE TABLE transactional_mail(dedupe_key text PRIMARY KEY,recipient text,payload text,status text DEFAULT 'pending',last_error text);CREATE TABLE sessions(user_id uuid);");
 const companyId=crypto.randomUUID(),restaurantId=crypto.randomUUID();await db.query('INSERT INTO restaurants VALUES($1,$2,$3)',[restaurantId,companyId,'Testbetrieb']);
 const c={query:(...args)=>db.query(...args)},pool={connect:async()=>({...c,release(){}})};
 const {employee,user}=await createStaffInvitation(c,{companyId,restaurantId,name:'Test Mitarbeiter',email:'staff@example.test',role:'cashier',restaurantName:'Testbetrieb'});
 assert.equal((await db.query('SELECT status FROM users')).rows[0].status,'pending');assert.equal((await db.query('SELECT pin_hash FROM employees')).rows[0].pin_hash,null);
 assert.equal((await db.query('SELECT count(*)::int n FROM transactional_mail')).rows[0].n,1);
 await assert.rejects(resendStaffInvitation(c,{companyId:crypto.randomUUID(),restaurantId,employeeId:employee.id}),/Keine offene/);
 await assert.rejects(resendStaffInvitation(c,{companyId,restaurantId,employeeId:employee.id}),/Minute/);
 await db.exec("UPDATE staff_invitations SET created_at=now()-interval '2 minutes'");const old=(await db.query('SELECT token_hash FROM staff_invitations')).rows[0].token_hash;
 await resendStaffInvitation(c,{companyId,restaurantId,employeeId:employee.id});assert.ok((await db.query('SELECT used_at FROM staff_invitations WHERE token_hash=$1',[old])).rows[0].used_at);
 assert.equal((await db.query("SELECT count(*)::int n FROM staff_invitations WHERE used_at IS NULL")).rows[0].n,1);assert.equal((await db.query("SELECT count(*)::int n FROM transactional_mail WHERE status='pending'")).rows[0].n,1);
 await db.query("UPDATE users SET status='active' WHERE id=$1",[user.id]);await assert.rejects(resendStaffInvitation(c,{companyId,restaurantId,employeeId:employee.id}),/Keine offene/);
 }finally{await db.close()}
});
