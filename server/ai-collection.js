import {migrateAiInvoices,issueInvoice,invoiceRoutes,validateIssuer,invoiceHtml} from './ai-invoices.js';
import crypto from 'node:crypto';
import {aiPool} from './ai-database.js';
import {supplierRoles,uuid} from './ai-policy.js';
const fail=(message,status=400)=>{const e=new Error(message);e.status=status;throw e};
const txt=(v,n=200)=>{if(typeof v!=='string'||v.trim().length>n)fail('Ungültige Eingabe');return v.trim()};
const currentMonth=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit'}).format(new Date());
const key=()=>process.env.AI_MOLLIE_API_KEY||'';
export async function migrateAiCollection(){await aiPool().query(`
INSERT INTO ai_settings(key,value) VALUES('collection','{"enabled":false,"requireMandate":false,"issuer":{}}') ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS ai_collection_mandates(supplier_id uuid PRIMARY KEY REFERENCES ai_accounts(id),consented_at timestamptz,consent_version int,customer_id text,mandate_id text,verified_at timestamptz,revoked_at timestamptz);
CREATE TABLE IF NOT EXISTS ai_collection_jobs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),supplier_id uuid NOT NULL REFERENCES ai_accounts(id),month text NOT NULL,net_cents bigint NOT NULL,order_ids jsonb NOT NULL,state text NOT NULL DEFAULT 'draft',reason text NOT NULL DEFAULT '',invoice_reference text NOT NULL DEFAULT '',gross_cents bigint,due_at timestamptz,notified_at timestamptz,payment_id text UNIQUE,customer_id text,mandate_id text,attempted_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(supplier_id,month));
`);await migrateAiInvoices()}
export async function collectionSettings(){return (await aiPool().query("SELECT value FROM ai_settings WHERE key='collection'")).rows[0].value}
function issuerReady(i){return Boolean(i&&['name','address','postalCode','city','taxId','creditorId'].every(k=>typeof i[k]==='string'&&i[k].trim())&&i.confirmed===true)}
async function api(path,body){if(!key())fail('Separater AI-Mollie-Zugang fehlt',503);const r=await fetch('https://api.mollie.com/v2'+path,{method:body?'POST':'GET',headers:{authorization:'Bearer '+key(),'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});if(!r.ok)fail('Mollie-Anfrage fehlgeschlagen. Anbieterzugang und Freischaltung prüfen.',503);return r.json()}
async function verifiedMandate(supplierId){
 const m=(await aiPool().query('SELECT m.*,a.email,a.status FROM ai_collection_mandates m JOIN ai_accounts a ON a.id=m.supplier_id WHERE supplier_id=$1',[supplierId])).rows[0];
 if(!m?.consented_at||m.revoked_at||!m.customer_id||!m.mandate_id||m.status!=='active')fail('Gültiges Lieferantenmandat erforderlich',409);
 const [c,mandate]=await Promise.all([api('/customers/'+m.customer_id),api('/customers/'+m.customer_id+'/mandates/'+m.mandate_id)]);
 if(String(c.email||'').toLowerCase()!==m.email.toLowerCase()||mandate.id!==m.mandate_id||mandate.status!=='valid'||mandate.method!=='directdebit')fail('Mollie bestätigt kein passendes gültiges SEPA-Mandat',409);
 await aiPool().query('UPDATE ai_collection_mandates SET verified_at=now() WHERE supplier_id=$1',[supplierId]);return m;
}
export async function supplierMayTrade(supplierId){const cfg=await collectionSettings();if(!cfg.requireMandate)return true;try{await verifiedMandate(supplierId);return true}catch{return false}}
export async function prepareCollectionJobs(){
 // Calendar month is fixed in Europe/Berlin; only completed received periods are proposed.
 await aiPool().query(`INSERT INTO ai_collection_jobs(supplier_id,month,net_cents,order_ids) SELECT o.supplier_id,to_char(o.received_at AT TIME ZONE 'Europe/Berlin','YYYY-MM'),sum(o.commission_cents),jsonb_agg(o.id ORDER BY o.id) FROM ai_orders o LEFT JOIN ai_commission_payments p ON p.order_id=o.id WHERE o.status='received' AND o.commission_cents>0 AND p.order_id IS NULL AND to_char(o.received_at AT TIME ZONE 'Europe/Berlin','YYYY-MM')<$1 GROUP BY o.supplier_id,to_char(o.received_at AT TIME ZONE 'Europe/Berlin','YYYY-MM') ON CONFLICT(supplier_id,month) DO UPDATE SET net_cents=excluded.net_cents,order_ids=excluded.order_ids,updated_at=now() WHERE ai_collection_jobs.state='draft'`,[currentMonth()]);
}
async function notice(job){
 const invoice=(await aiPool().query('SELECT invoice_number,snapshot FROM ai_commission_invoices WHERE job_id=$1',[job.id])).rows[0];
 if(![process.env.SMTP_HOST,process.env.SMTP_USER,process.env.SMTP_PASSWORD,process.env.SMTP_FROM].every(Boolean))fail('SMTP für Vorankündigung fehlt',503);
 const supplier=(await aiPool().query('SELECT email,business_name FROM ai_accounts WHERE id=$1',[job.supplier_id])).rows[0];const {default:nodemailer}=await import('nodemailer');const port=Number(process.env.SMTP_PORT||587);const transport=nodemailer.createTransport({host:process.env.SMTP_HOST,port,secure:port===465,requireTLS:port!==465,auth:{user:process.env.SMTP_USER,pass:process.env.SMTP_PASSWORD},tls:{rejectUnauthorized:true},connectionTimeout:10000,socketTimeout:15000});
 await transport.sendMail({from:process.env.SMTP_FROM,to:invoice?.snapshot?.recipient?.email||supplier.email,...(invoice?{attachments:[{filename:invoice.invoice_number+'.html',content:invoiceHtml(invoice.snapshot),contentType:'text/html'}]}:{}),messageId:'<ai-collection-'+job.id+'@bringness-ai.com>',subject:'Bringness AI – SEPA-Vorankündigung '+job.month,text:`Guten Tag ${supplier.business_name},\n\nfür die Abrechnung ${job.invoice_reference} ziehen wir ${(Number(job.gross_cents)/100).toFixed(2)} EUR am ${new Date(job.due_at).toLocaleDateString('de-DE',{timeZone:'Europe/Berlin'})} per SEPA-Lastschrift ein.\nMandat: ${job.mandate_id}\nGläubiger: ${(await collectionSettings()).issuer.name}\nGläubiger-ID: ${(await collectionSettings()).issuer.creditorId}\nDie Abrechnungsübersicht finden Sie in Ihrem Bringness-AI-Konto unter Zahlungsautomatik.\n\nBitte prüfen Sie Betrag und Termin. Bei Fragen wenden Sie sich an die Plattformverwaltung.`});
}
export async function collectionTick({sendNotice=notice}={}){
 const pool=aiPool(),c=await pool.connect();try{
  if(!(await c.query('SELECT pg_try_advisory_lock(771092) locked')).rows[0].locked)return;
  await prepareCollectionJobs();const cfg=await collectionSettings();if(!cfg.enabled||!issuerReady(cfg.issuer)||!key())return;
  // Polling, not an unauthenticated webhook, determines payment success.
  if(cfg.autoInvoices&&validateIssuer(cfg.issuer)){const drafts=(await pool.query("SELECT * FROM ai_collection_jobs WHERE state='draft' ORDER BY updated_at LIMIT 40")).rows;for(const draft of drafts){try{const profile=(await pool.query('SELECT electronic_consent_at,country FROM ai_invoice_profiles WHERE supplier_id=$1',[draft.supplier_id])).rows[0];if(!profile?.electronic_consent_at||profile.country!=='DE')fail('Deutsches Rechnungsprofil und Format-Zustimmung fehlen',409);const m=await verifiedMandate(draft.supplier_id);await issueInvoice(draft,cfg,m)}catch(e){await pool.query("UPDATE ai_collection_jobs SET reason=$2,updated_at=now() WHERE id=$1 AND state='draft'",[draft.id,e.status?e.message:'Rechnungserstellung fehlgeschlagen'])}}}
  const jobs=(await pool.query("SELECT * FROM ai_collection_jobs WHERE state IN ('scheduled','notified','processing','pending','notification_pending') ORDER BY updated_at LIMIT 80")).rows;
  jobs.push(...(await pool.query("SELECT * FROM ai_collection_jobs WHERE state='paid' ORDER BY updated_at LIMIT 20")).rows);
  for(const j of jobs){try{await pool.query('UPDATE ai_collection_jobs SET updated_at=now() WHERE id=$1',[j.id]);
   if(j.state==='notification_pending'){await pool.query("UPDATE ai_collection_jobs SET state='exception',reason='Vorankündigung unklar; Versand prüfen, kein Einzug',updated_at=now() WHERE id=$1",[j.id]);continue}
   if(j.payment_id){const p=await api('/payments/'+j.payment_id);if(p.id!==j.payment_id||p.customerId!==j.customer_id||p.amount?.currency!=='EUR'||p.amount.value!==(Number(j.gross_cents)/100).toFixed(2)||p.metadata?.collectionId!==j.id)fail('Zahlungsabgleich widersprüchlich',409);
    if(Number(p.amountChargedBack?.value||0)>0||Number(p.amountRefunded?.value||0)>0){await pool.query("UPDATE ai_collection_jobs SET state='exception',reason='Rücklastschrift oder Erstattung: Zahlung und Rechnung manuell abgleichen',updated_at=now() WHERE id=$1",[j.id]);continue}
    if(p.status==='paid'&&j.state!=='paid'){
     await c.query('BEGIN');await c.query('SELECT id FROM ai_collection_jobs WHERE id=$1 FOR UPDATE',[j.id]);
     for(const id of j.order_ids){const o=(await c.query('SELECT commission_cents FROM ai_orders WHERE id=$1 FOR UPDATE',[id])).rows[0];if((await c.query('SELECT 1 FROM ai_commission_payments WHERE order_id=$1',[id])).rowCount)fail('Provision bereits anderweitig ausgeglichen',409);await c.query('INSERT INTO ai_commission_payments(order_id,amount_cents,reference,recorded_by) VALUES($1,$2,$3,$4)',[id,o.commission_cents,'Mollie '+p.id,cfg.operatorId]);}
     await c.query("UPDATE ai_collection_jobs SET state='paid',reason='',updated_at=now() WHERE id=$1",[j.id]);await c.query("INSERT INTO ai_audit(actor_id,target_id,action,detail) VALUES($1,$2,'collection_paid',$3)",[cfg.operatorId,j.id,JSON.stringify({paymentId:p.id})]);await c.query('COMMIT');
    }else if(j.state==='paid'&&p.status==='paid'){await pool.query('UPDATE ai_collection_jobs SET updated_at=now() WHERE id=$1',[j.id]);}else if(['failed','expired','canceled'].includes(p.status))await pool.query("UPDATE ai_collection_jobs SET state='exception',reason='Zahlung fehlgeschlagen – kein automatischer neuer Versuch',updated_at=now() WHERE id=$1",[j.id]);continue;
   }
   if(j.state==='processing'){await pool.query("UPDATE ai_collection_jobs SET state='exception',reason='Unklarer Zahlungsversuch: im Mollie-Konto abgleichen, nicht erneut abbuchen',updated_at=now() WHERE id=$1",[j.id]);continue}
   const m=await verifiedMandate(j.supplier_id);if(m.customer_id!==j.customer_id||m.mandate_id!==j.mandate_id)fail('Mandat geändert; neue Vorankündigung erforderlich',409);
   if(j.state==='scheduled'){
    // Set notification state before sending; ambiguous email delivery is reviewed, never triggers collection.
    j.due_at=new Date(Math.max(+new Date(j.due_at),Date.now()+15*86400000)).toISOString();await pool.query("UPDATE ai_collection_jobs SET state='notification_pending',due_at=$2,updated_at=now() WHERE id=$1",[j.id,j.due_at]);await sendNotice(j);await pool.query("UPDATE ai_collection_jobs SET state='notified',notified_at=now(),updated_at=now() WHERE id=$1",[j.id]);continue;
   }
   if(j.state==='notified'&&new Date(j.due_at)<=new Date()){
    if(!j.notified_at||Date.now()-+new Date(j.notified_at)<14*86400000)fail('Vorankündigungsfrist noch nicht erfüllt',409);
    const orders=(await pool.query("SELECT o.id,o.commission_cents,p.order_id paid FROM ai_orders o LEFT JOIN ai_commission_payments p ON p.order_id=o.id WHERE o.id=ANY($1::uuid[]) AND o.status='received'",[j.order_ids])).rows;
    if(orders.length!==j.order_ids.length||orders.some(o=>o.paid)||orders.reduce((n,o)=>n+Number(o.commission_cents),0)!==Number(j.net_cents))fail('Abrechnungsbetrag geändert. Kein Einzug.',409);
    await pool.query("UPDATE ai_collection_jobs SET state='processing',attempted_at=now(),updated_at=now() WHERE id=$1",[j.id]);
    // Never repeat a POST after an ambiguous response. Its payment ID must be reconciled first.
    const p=await api('/payments',{amount:{currency:'EUR',value:(Number(j.gross_cents)/100).toFixed(2)},customerId:j.customer_id,mandateId:j.mandate_id,sequenceType:'recurring',method:'directdebit',description:'Bringness AI '+j.invoice_reference,metadata:{collectionId:j.id}});
    if(!/^tr_[A-Za-z0-9]+$/.test(String(p.id)))fail('Mollie-Zahlungsantwort unklar',503);
    await pool.query("UPDATE ai_collection_jobs SET payment_id=$2,state='pending',updated_at=now() WHERE id=$1",[j.id,p.id]);
   }
  }catch(e){await c.query('ROLLBACK').catch(()=>{});if(j.payment_id&&e.status!==409){await pool.query('UPDATE ai_collection_jobs SET reason=$2,updated_at=now() WHERE id=$1',[j.id,'Anbieterstatus vorübergehend nicht verfügbar; Abgleich wird wiederholt'])}else await pool.query("UPDATE ai_collection_jobs SET state='exception',reason=$2,updated_at=now() WHERE id=$1",[j.id,e.status?e.message:'Technischer Fehler – Zahlung im Anbieterportal prüfen']);}}
 }finally{await c.query('SELECT pg_advisory_unlock(771092)').catch(()=>{});c.release()}
}
export async function collectionRoutes(p,method,b,u,url,admin=false){
 const base=admin?'/api/ai/admin/collection':'/api/ai/collection';if(!admin&&!supplierRoles.includes(u.role))fail('Nur Lieferanten',403);
 const invoiceResult=await invoiceRoutes(p,method,b,u,admin);if(invoiceResult)return invoiceResult;
 if(p===base&&method==='GET'){const cfg=await collectionSettings();const jobs=(await aiPool().query('SELECT j.*,s.business_name supplier_name,EXISTS(SELECT 1 FROM ai_commission_invoices i WHERE i.job_id=j.id) invoice_available FROM ai_collection_jobs j JOIN ai_accounts s ON s.id=j.supplier_id WHERE $1::boolean OR supplier_id=$2 ORDER BY j.created_at DESC LIMIT 500',[admin,u.id])).rows;const mandates=(await aiPool().query('SELECT supplier_id,consented_at,verified_at,revoked_at,customer_id,mandate_id FROM ai_collection_mandates WHERE $1::boolean OR supplier_id=$2',[admin,u.id])).rows;return {settings:admin?cfg:{enabled:cfg.enabled,requireMandate:cfg.requireMandate},providerConfigured:Boolean(key()),providerMode:key().startsWith('live_')?'live':key().startsWith('test_')?'test':'missing',issuerReady:issuerReady(cfg.issuer),automaticInvoiceReady:validateIssuer(cfg.issuer),jobs,mandates}}
 if(method!=='POST')fail('Methode nicht erlaubt',405);
 if(!admin){
  if(p===base+'/consent'){if(b.confirmed!==true)fail('Ausdrückliche Zustimmung erforderlich');await aiPool().query('INSERT INTO ai_collection_mandates(supplier_id,consented_at,consent_version) VALUES($1,now(),1) ON CONFLICT(supplier_id) DO UPDATE SET consented_at=coalesce(ai_collection_mandates.consented_at,now()),consent_version=1,revoked_at=NULL,verified_at=CASE WHEN ai_collection_mandates.revoked_at IS NULL THEN ai_collection_mandates.verified_at ELSE NULL END,customer_id=CASE WHEN ai_collection_mandates.revoked_at IS NULL THEN ai_collection_mandates.customer_id ELSE NULL END,mandate_id=CASE WHEN ai_collection_mandates.revoked_at IS NULL THEN ai_collection_mandates.mandate_id ELSE NULL END',[u.id]);await aiPool().query("INSERT INTO ai_audit(actor_id,target_id,action) VALUES($1,$1,'collection_consent')",[u.id]);return {ok:true,message:'Zustimmung gespeichert. Noch kein SEPA-Mandat; Mollie-Bestätigung erforderlich.'}}
  if(p===base+'/revoke'){await aiPool().query('UPDATE ai_collection_mandates SET revoked_at=now(),verified_at=NULL WHERE supplier_id=$1',[u.id]);await aiPool().query("INSERT INTO ai_audit(actor_id,target_id,action) VALUES($1,$1,'collection_revoked')",[u.id]);return {ok:true}}
  fail('Nur Plattformadministrator',403);
 }
 if(p===base+'/settings'){
  if(typeof b.enabled!=='boolean'||typeof b.requireMandate!=='boolean')fail('Schalter erforderlich');const issuer={};for(const k of ['name','address','postalCode','city','taxId','creditorId'])issuer[k]=txt(b.issuer?.[k]||'');issuer.confirmed=b.issuer?.confirmed===true;issuer.country=txt(b.issuer?.country||'');issuer.taxMode=txt(b.issuer?.taxMode||'');issuer.taxConfirmed=b.issuer?.taxConfirmed===true;const autoInvoices=b.autoInvoices===true;if(autoInvoices&&!validateIssuer(issuer))fail('Deutsche Rechnungsstellerdaten und Steuerregelung geprüft hinterlegen',409);
  if(b.enabled&&(!issuerReady(issuer)||!key().startsWith('live_')||![process.env.SMTP_HOST,process.env.SMTP_USER,process.env.SMTP_PASSWORD,process.env.SMTP_FROM].every(Boolean)))fail('Rechnungssteller, AI-Mollie-Zugang und Mailversand zuerst einrichten',409);
  await aiPool().query("UPDATE ai_settings SET value=$1 WHERE key='collection'",[JSON.stringify({enabled:b.enabled,requireMandate:b.requireMandate,autoInvoices,issuer,operatorId:u.id})]);await aiPool().query("INSERT INTO ai_audit(actor_id,action,detail) VALUES($1,'collection_settings',$2)",[u.id,JSON.stringify({enabled:b.enabled,requireMandate:b.requireMandate})]);return {ok:true};
 }
 if(p===base+'/prepare'){await prepareCollectionJobs();return {ok:true}}
 if(p===base+'/verify'){
  if(!uuid.test(String(b.supplierId))||!/^cst_[A-Za-z0-9]+$/.test(String(b.customerId))||!/^mdt_[A-Za-z0-9]+$/.test(String(b.mandateId)))fail('Gültige Anbieterreferenzen erforderlich');
  const old=(await aiPool().query('SELECT * FROM ai_collection_mandates WHERE supplier_id=$1',[b.supplierId])).rows[0];if(!old?.consented_at||old.revoked_at)fail('Lieferant muss zuerst zustimmen',409);
  const [customer,m]=await Promise.all([api('/customers/'+b.customerId),api('/customers/'+b.customerId+'/mandates/'+b.mandateId)]);const s=(await aiPool().query('SELECT email FROM ai_accounts WHERE id=$1',[b.supplierId])).rows[0];
  if(!s||String(customer.email||'').toLowerCase()!==s.email.toLowerCase()||m.id!==b.mandateId||m.status!=='valid'||m.method!=='directdebit')fail('Kein passendes gültiges SEPA-Mandat',409);
  await aiPool().query('UPDATE ai_collection_mandates SET customer_id=$2,mandate_id=$3,verified_at=now() WHERE supplier_id=$1 AND revoked_at IS NULL',[b.supplierId,b.customerId,b.mandateId]);return {ok:true};
 }
 if(p===base+'/reconcile'){
  if(!uuid.test(String(b.id))||!/^tr_[A-Za-z0-9]+$/.test(String(b.paymentId)))fail('Zahlungsreferenz erforderlich');const j=(await aiPool().query("SELECT * FROM ai_collection_jobs WHERE id=$1 AND state='exception'",[b.id])).rows[0];if(!j||!j.attempted_at)fail('Kein unklarer Zahlungsversuch',409);const pmt=await api('/payments/'+b.paymentId);if(pmt.customerId!==j.customer_id||pmt.metadata?.collectionId!==j.id||pmt.amount?.currency!=='EUR'||pmt.amount.value!==(Number(j.gross_cents)/100).toFixed(2))fail('Zahlung passt nicht zur Abrechnung',409);if(Number(pmt.amountChargedBack?.value||0)>0||Number(pmt.amountRefunded?.value||0)>0)fail('Rücklastschrift oder Erstattung gesondert buchhalterisch prüfen',409);await aiPool().query("UPDATE ai_collection_jobs SET payment_id=$2,state='pending',reason='',updated_at=now() WHERE id=$1",[j.id,b.paymentId]);return {ok:true};
 }
 if(p===base+'/cancel'){if(!uuid.test(String(b.id)))fail('Ungültige ID');const r=await aiPool().query("UPDATE ai_collection_jobs SET state='cancelled',reason='Durch Plattformverwaltung vor Einzug gestoppt',updated_at=now() WHERE id=$1 AND payment_id IS NULL AND attempted_at IS NULL AND state IN ('draft','scheduled','notified','exception') RETURNING id",[b.id]);if(!r.rowCount)fail('Begonnene Zahlung zuerst mit Mollie abgleichen',409);return {ok:true}}
 if(p===base+'/release'){
  if(!uuid.test(String(b.id))||!Number.isSafeInteger(b.grossCents)||b.grossCents<=0||b.confirmed!==true)fail('Rechnung und Gesamtbetrag ausdrücklich bestätigen');const reference=txt(b.invoiceReference);if(!reference)fail('Bereits erstellte Rechnung erforderlich');const cfg=await collectionSettings();if(!issuerReady(cfg.issuer))fail('Rechnungsdaten fehlen',409);
  const c=await aiPool().connect();try{await c.query('BEGIN');const j=(await c.query("SELECT * FROM ai_collection_jobs WHERE id=$1 AND state='draft' FOR UPDATE",[b.id])).rows[0];if(!j)fail('Nur unveröffentlichte Abrechnung freigeben',409);if(b.grossCents<Number(j.net_cents))fail('Bruttobetrag darf Nettoprovision nicht unterschreiten');const reservedOrders=(await c.query("SELECT o.id,o.commission_cents,p.order_id paid FROM ai_orders o LEFT JOIN ai_commission_payments p ON p.order_id=o.id WHERE o.id=ANY($1::uuid[]) AND o.status='received' FOR UPDATE OF o",[j.order_ids])).rows;if(reservedOrders.length!==j.order_ids.length||reservedOrders.some(o=>o.paid)||reservedOrders.reduce((n,o)=>n+Number(o.commission_cents),0)!==Number(j.net_cents))fail('Offener Betrag geändert; Entwurf neu vorbereiten',409);const m=await verifiedMandate(j.supplier_id);
   const due=new Date(Date.now()+15*86400000);await c.query("UPDATE ai_collection_jobs SET state='scheduled',gross_cents=$2,invoice_reference=$3,customer_id=$4,mandate_id=$5,due_at=$6,updated_at=now() WHERE id=$1",[j.id,b.grossCents,reference,m.customer_id,m.mandate_id,due.toISOString()]);await c.query("INSERT INTO ai_audit(actor_id,target_id,action,detail) VALUES($1,$2,'collection_release',$3)",[u.id,j.id,JSON.stringify({invoiceReference:reference,grossCents:b.grossCents,dueAt:due.toISOString()})]);await c.query('COMMIT');return {ok:true};
  }catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}
 }
 fail('Aktion nicht gefunden',404);
}

export async function ensureManualPaymentAllowed(c,ids){if((await c.query("SELECT 1 FROM ai_collection_jobs WHERE state NOT IN ('draft','cancelled') AND order_ids ?| $1::text[] LIMIT 1",[ids])).rowCount)fail('Provision ist für einen SEPA-Einzug reserviert. Zahlungsautomatik zuerst abgleichen.',409)}
