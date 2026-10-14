import crypto from 'node:crypto';
import fs from 'node:fs';
import {FISKALY_AUTH_URL,validateTestCredentials,sealTestCredentials,openTestCredentials} from './fiskaly-test.js';
const base=FISKALY_AUTH_URL.replace(/\/auth$/,'');
export const credentialFingerprint=key=>crypto.createHash('sha256').update(key).digest('hex');
const problem=code=>{throw Object.assign(Error('Fiskaly TEST setup failed'),{safeCode:code})};
export const onboardingRequest=JSON.parse(fs.readFileSync(new URL('./fiskaly-test-request.json',import.meta.url),'utf8'));
export async function migrateFiskalySandbox(pool){await pool.query(`CREATE TABLE IF NOT EXISTS fiskaly_test_setup(company_id uuid PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,credential_fingerprint text NOT NULL,request_id uuid UNIQUE NOT NULL,tss_id uuid NOT NULL,client_id uuid NOT NULL,tx_id uuid NOT NULL,phase text NOT NULL DEFAULT 'pending',state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','running','failed','complete')),secret_payload text,proof jsonb,last_error text,updated_at timestamptz NOT NULL DEFAULT now(),signed_at timestamptz,attempts int NOT NULL DEFAULT 0);`)}
export async function requestFiskalySetup(pool,companyId,credentials,requestId=crypto.randomUUID()){
 validateTestCredentials(credentials);await pool.query(`INSERT INTO fiskaly_test_setup(company_id,credential_fingerprint,request_id,tss_id,client_id,tx_id) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(company_id) DO NOTHING`,[companyId,credentialFingerprint(credentials.apiKey),requestId,crypto.randomUUID(),crypto.randomUUID(),crypto.randomUUID()]);
 const row=(await pool.query('SELECT credential_fingerprint FROM fiskaly_test_setup WHERE company_id=$1',[companyId])).rows[0];if(row.credential_fingerprint!==credentialFingerprint(credentials.apiKey))problem('credential_changed');
 await pool.query("UPDATE fiskaly_test_setup SET state='pending',last_error=NULL,attempts=0,updated_at=now() WHERE company_id=$1 AND state='failed'",[companyId]);
}
export async function sandboxStatus(pool,companyId){const row=(await pool.query('SELECT state,phase,tss_id,client_id,tx_id,proof,last_error,signed_at FROM fiskaly_test_setup WHERE company_id=$1',[companyId])).rows[0];return row?{state:row.state,phase:row.phase,tssId:row.tss_id,clientId:row.client_id,transactionId:row.tx_id,proof:row.proof,signedAt:row.signed_at,errorCode:row.last_error}:{state:'not_started'}}
export async function runSandboxSetup(pool,row,credentials,{env=process.env,fetcher=fetch}={}){
 validateTestCredentials(credentials);if(credentialFingerprint(credentials.apiKey)!==row.credential_fingerprint)problem('credential_changed');
 let token;
 async function call(method,path,data,{allow404=false,resource=false}={}){
  let response;try{response=await fetcher(base+path,{method,redirect:'error',signal:AbortSignal.timeout(20000),headers:{'content-type':'application/json','request-id':crypto.randomUUID(),...(token?{authorization:'Bearer '+token}:{})},...(data!==undefined?{body:JSON.stringify(data)}:{})})}catch{problem('provider_unreachable')}
  if(response.status===404&&allow404)return null;
  if(!response.ok)problem('provider_http_'+response.status);
  let result;try{result=await response.json()}catch{problem('provider_invalid_response')}
  if(resource&&result._env!=='TEST')problem('environment_not_test');return result;
 }
 const auth=await call('POST','/auth',{api_key:credentials.apiKey,api_secret:credentials.apiSecret});if(typeof auth.access_token!=='string'||!auth.access_token)problem('provider_no_token');token=auth.access_token;
 const companyId=row.company_id,tssPath='/tss/'+row.tss_id;
 async function save(phase,secret){await pool.query("UPDATE fiskaly_test_setup SET phase=$2,secret_payload=coalesce($3,secret_payload),updated_at=now() WHERE company_id=$1",[companyId,phase,secret?sealTestCredentials({...secret,companyId},env):null]);row.phase=phase}
 let secret=row.secret_payload?openTestCredentials(row.secret_payload,companyId,env):null;
 let tss=await call('GET',tssPath,undefined,{allow404:true,resource:true});
 if(tss&&tss._id!==row.tss_id)problem('tss_mismatch');
 if(!secret){if(tss&&tss.state!=='CREATED')problem('admin_secret_missing');tss=await call('PUT',tssPath,{metadata:{purpose:'Bringness TEST onboarding'}},{resource:true});if(tss._id!==row.tss_id)problem('tss_mismatch');if(typeof tss.admin_puk!=='string'||!tss.admin_puk)problem('provider_no_puk');secret={puk:tss.admin_puk,pin:crypto.randomBytes(16).toString('hex')};await save('tss_created',secret)}
 if(tss.state==='CREATED'){tss=await call('PATCH',tssPath,{state:'UNINITIALIZED'},{resource:true});await save('deployed')}
 if(!['UNINITIALIZED','INITIALIZED'].includes(tss.state))problem('tss_not_available');
 if(['pending','tss_created','deployed'].includes(row.phase)){await call('PATCH',tssPath+'/admin',{admin_puk:secret.puk,new_admin_pin:secret.pin});await save('pin_set')}
 let admin=false;
 try{
  await call('POST',tssPath+'/admin/auth',{admin_pin:secret.pin});admin=true;
  if(tss.state==='UNINITIALIZED'){tss=await call('PATCH',tssPath,{state:'INITIALIZED'},{resource:true});await save('initialized')}
  if(tss.state!=='INITIALIZED')problem('tss_not_initialized');
  let client=await call('GET',tssPath+'/client/'+row.client_id,undefined,{allow404:true,resource:true});
  if(!client)client=await call('PUT',tssPath+'/client/'+row.client_id,{serial_number:'BRINGNESS-TEST-'+row.client_id},{resource:true});
  if(client._id!==row.client_id)problem('client_mismatch');await save('client_created');
 }finally{if(admin)await call('POST',tssPath+'/admin/logout',{}).catch(()=>{})}
 const txPath=tssPath+'/tx/'+row.tx_id;
 let tx=await call('GET',txPath,undefined,{allow404:true,resource:true});
 if(!tx){tx=await call('PUT',txPath+'?tx_revision=1',{state:'ACTIVE',client_id:row.client_id},{resource:true});await save('tx_started')}
 if(tx.state==='ACTIVE'){if(tx.latest_revision!==1&&tx.revision!==1)problem('unexpected_transaction_revision');tx=await call('PUT',txPath+'?tx_revision=2',{state:'FINISHED',client_id:row.client_id,schema:{standard_v1:{receipt:{receipt_type:'RECEIPT',amounts_per_vat_rate:[{vat_rate:'NORMAL',amount:'10.00'}],amounts_per_payment_type:[{payment_type:'CASH',amount:'10.00',currency_code:'EUR'}]}}},metadata:{purpose:'Bringness TEST sample only'}},{resource:true})}
 if(tx.state!=='FINISHED'||tx._id!==row.tx_id||tx.client_id!==row.client_id||tx.tss_id!==row.tss_id||typeof tx.signature?.value!=='string'||!tx.signature.value||!tx.signature.counter||!tx.qr_code_data)problem('signature_not_confirmed');
 const proof={mode:'TEST',amount:'10.00',currency:'EUR',transactionNumber:tx.number,revision:tx.latest_revision||tx.revision,signature:tx.signature,qrCodeData:tx.qr_code_data,timeStart:tx.time_start,timeEnd:tx.time_end,tssSerialNumber:tx.tss_serial_number,clientSerialNumber:tx.client_serial_number};
 await pool.query("UPDATE fiskaly_test_setup SET state='complete',phase='signed',proof=$2::jsonb,last_error=NULL,signed_at=now(),updated_at=now() WHERE company_id=$1",[companyId,JSON.stringify(proof)]);
 return proof;
}
export function createSandboxWorker(pool,{env=process.env,fetcher=fetch,request=onboardingRequest}={}){
 let busy=false;
 return async()=>{if(busy)return;busy=true;let connection,locked=false;
 try{
  connection=await pool.connect();locked=(await connection.query('SELECT pg_try_advisory_lock(81420017) locked')).rows[0].locked;if(!locked)return;
  const configured=(await connection.query("SELECT company_id,payload FROM fiskaly_test_credentials WHERE status='connected'")).rows;
  const matches=[];for(const c of configured){try{const credentials=openTestCredentials(c.payload,c.company_id,env);if(request.mode==='TEST'&&credentialFingerprint(credentials.apiKey)===request.credentialFingerprint)matches.push({...c,credentials})}catch{}}
  // Automatic request targets exactly the key the owner authorized in this conversation.
  if(matches.length===1&&!(await connection.query('SELECT 1 FROM fiskaly_test_setup WHERE request_id=$1',[request.requestId])).rowCount)await requestFiskalySetup(connection,matches[0].company_id,matches[0].credentials,request.requestId);
  const jobs=(await connection.query("SELECT j.*,c.payload credentials_payload FROM fiskaly_test_setup j JOIN fiskaly_test_credentials c USING(company_id) WHERE j.state IN ('pending','running') ORDER BY j.updated_at LIMIT 5")).rows;
  for(const row of jobs){try{await connection.query("UPDATE fiskaly_test_setup SET state='running',attempts=attempts+1,updated_at=now() WHERE company_id=$1",[row.company_id]);const credentials=openTestCredentials(row.credentials_payload,row.company_id,env);await runSandboxSetup(connection,row,credentials,{env,fetcher});console.log('Fiskaly TEST onboarding: signed sample confirmed.')}catch(error){const code=/^[a-z_]+(?:[0-9]+)?$/.test(error.safeCode||'')?error.safeCode:'setup_unavailable';const retry=['provider_unreachable','provider_http_503','provider_http_429'].includes(code)&&row.attempts<4;await connection.query("UPDATE fiskaly_test_setup SET state=$3,last_error=$2,updated_at=now() WHERE company_id=$1",[row.company_id,code,retry?'pending':'failed']);console.log('Fiskaly TEST onboarding: '+code)}}
 }finally{if(locked)await connection.query('SELECT pg_advisory_unlock(81420017)').catch(()=>{});connection?.release();busy=false}
 };
}
