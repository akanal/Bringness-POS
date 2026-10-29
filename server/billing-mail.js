import {providerEuroCents} from './provider-money.js';
import PDFDocument from 'pdfkit';
import {enqueueMail} from './transactional-mail.js';
import {billingMail} from './mail-templates.js';
export async function migrateBillingMail(pool){await pool.query(`CREATE TABLE IF NOT EXISTS billing_mail_events(transaction_id uuid PRIMARY KEY REFERENCES billing_transactions(id) ON DELETE CASCADE,kind text NOT NULL CHECK(kind IN ('invoice','reminder')),created_at timestamptz NOT NULL DEFAULT now(),due_at timestamptz NOT NULL);`)}
export async function recordBillingMail(c,tx,status){
 if(status==='paid'&&!tx.paid_at)await c.query("INSERT INTO billing_mail_events(transaction_id,kind,due_at) VALUES($1,'invoice',now()) ON CONFLICT(transaction_id) DO UPDATE SET kind='invoice',due_at=now()",[tx.id]);
 else if(status==='failed'&&tx.mollie_subscription_id&&!tx.paid_at)await c.query("INSERT INTO billing_mail_events(transaction_id,kind,due_at) SELECT id,'reminder',now()+interval '7 days' FROM billing_transactions WHERE id=$1 AND created_at>now()-interval '1 day' ON CONFLICT DO NOTHING",[tx.id]);
}
const rowSql=`SELECT bt.*,bp.name,e.kind,e.created_at event_at,u.email,c.customer_number FROM billing_mail_events e JOIN billing_transactions bt ON bt.id=e.transaction_id JOIN billing_plans bp ON bp.id=bt.plan_id JOIN companies c ON c.id=bt.company_id JOIN LATERAL(SELECT email FROM users WHERE company_id=bt.company_id AND role='owner' AND status='active' ORDER BY created_at,id LIMIT 1) u ON true`;
export function createBillingMail(pool,{env=process.env,fetchPayment=fetch}={}){
 let running=false;
 const origin=()=>{const u=new URL(env.PUBLIC_BASE_URL||'https://bringness.de');if(u.protocol!=='https:')throw Error('PUBLIC_ORIGIN_INVALID');return u.origin};
 async function current(id,recipient){const z=(await pool.query(rowSql+' WHERE bt.id=$1 AND u.email=$2',[id,recipient])).rows[0];if(!z)return null;
  if(z.kind==='invoice')return z.status==='paid'&&z.paid_at&&z.invoice_number?z:null;
  if(z.status!=='failed'||z.paid_at||!z.mollie_subscription_id||!env.MOLLIE_API_KEY)return null;
  const settled=(await pool.query("SELECT 1 FROM billing_transactions WHERE mollie_subscription_id=$1 AND status='paid' AND paid_at>=$2",[z.mollie_subscription_id,z.event_at])).rows[0];if(settled)return null;
  const response=await fetchPayment('https://api.mollie.com/v2/payments/'+encodeURIComponent(z.provider_payment_id),{redirect:'error',headers:{Authorization:'Bearer '+env.MOLLIE_API_KEY},signal:AbortSignal.timeout(10000)});if(!response.ok)throw Error('PAYMENT_CHECK_UNAVAILABLE');const p=await response.json();
  let checkedCents;try{checkedCents=providerEuroCents(p.amount);}catch{return null;}
  if(p.id!==z.provider_payment_id||p.status!=='failed'||p.subscriptionId!==z.mollie_subscription_id||p.amount?.currency!==z.currency||checkedCents!==z.amount_cents)return null;
  return z;
 }
 async function tick(){if(running)return;running=true;try{const rows=(await pool.query(rowSql+` WHERE e.due_at<=now() AND ((e.kind='invoice' AND bt.status='paid') OR (e.kind='reminder' AND bt.status='failed')) AND NOT EXISTS(SELECT 1 FROM transactional_mail m WHERE m.dedupe_key='billing:'||e.kind||':'||bt.id::text) ORDER BY e.due_at LIMIT 20`)).rows;for(const z of rows){try{const good=await current(z.id,z.email);if(good)await enqueueMail(pool,'billing:'+z.kind+':'+z.id,z.email,{kind:'billing',transactionId:z.id,billingKind:z.kind});}catch{console.error('Billing mail event unavailable');}}}finally{running=false}}
 async function resolve(message,recipient){const z=await current(message.transactionId,recipient);if(!z||z.kind!==message.billingKind)return null;const result=billingMail(z.kind,z,origin()+'/pos/');if(z.kind==='invoice')result.attachments=[{filename:'Rechnung-'+z.invoice_number.replace(/[^A-Za-z0-9-]/g,'')+'.pdf',content:await invoicePdf(z,env)}];return result;}
 return {tick,resolve};
}
export async function invoicePdf(z,env){
 const doc=new PDFDocument({size:'A4',margin:55}),chunks=[];const ready=new Promise((resolve,reject)=>{doc.on('data',x=>chunks.push(x));doc.on('end',()=>resolve(Buffer.concat(chunks)));doc.on('error',reject)});
 const money=x=>(Number(x)/100).toLocaleString('de-DE',{style:'currency',currency:'EUR'}),b=z.billing_snapshot||{};
 doc.fontSize(22).text(env.INVOICE_SELLER_NAME||'Bringness');if(env.INVOICE_SELLER_ADDRESS)doc.fontSize(10).text(env.INVOICE_SELLER_ADDRESS);if(env.INVOICE_TAX_ID)doc.fontSize(10).text('Steuer-ID / USt-ID: '+env.INVOICE_TAX_ID);
 doc.moveDown().fontSize(18).text('Rechnung '+z.invoice_number).fontSize(10).text('Rechnungsdatum: '+new Date(z.invoice_date).toLocaleDateString('de-DE')).moveDown();
 if(z.customer_number!=null){doc.fontSize(9).text('Kundennummer: '+String(z.customer_number),355,130,{width:185,align:'right'});}
 for(const v of [b.company_name,b.contact_name,b.street,[b.postal_code,b.city].filter(Boolean).join(' '),b.country,b.vat_id])if(v)doc.text(String(v));
 doc.moveDown().text(z.name||'Bringness-Abonnement').text('Nettobetrag: '+money(z.net_cents)).text('MwSt. '+Number(z.vat_rate||19).toLocaleString('de-DE')+' %: '+money(z.vat_cents)).text('Gesamtbetrag: '+money(z.amount_cents)).moveDown().text('Zahlung über Mollie erhalten.').text('Bei Fragen schreiben Sie bitte an info@bringness.de.');doc.end();return ready;
}
