import {aiPool} from './ai-database.js';
import {procurementDraft} from './ai-procurement.js';
import {cartTransaction} from './ai-cart.js';
import {berlinClock} from './ai-forecast-core.js';
import {uuid} from './ai-policy.js';
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status})};
export function procurementPolicy(b){
 if(typeof b.enabled!=='boolean')fail('Aktivierung erforderlich');
 if(!Number.isInteger(b.days)||b.days<1||b.days>30||!Number.isInteger(b.leadDays)||b.leadDays<1||b.leadDays>30)fail('Planungs- und Lieferfrist: 1 bis 30 Tage');
 if(!Number.isSafeInteger(b.maxDailyNetCents)||b.maxDailyNetCents<100||b.maxDailyNetCents>1000000)fail('Netto-Warenwertgrenze: 1 bis 10.000 Euro pro Tag');
 if(!Array.isArray(b.supplierIds)||!b.supplierIds.length||b.supplierIds.length>50||!b.supplierIds.every(x=>uuid.test(x))||new Set(b.supplierIds).size!==b.supplierIds.length)fail('1 bis 50 eindeutige Lieferanten erforderlich');
 if(b.enabled&&b.confirmed!==true)fail('Automatische verbindliche Bestellungen und Lieferbedingungen ausdrücklich freigeben');
 return {enabled:b.enabled,days:b.days,leadDays:b.leadDays,maxDailyNetCents:b.maxDailyNetCents,supplierIds:b.supplierIds};
}
export async function migrateAutoProcurement(db=aiPool()){await db.query(`
CREATE TABLE IF NOT EXISTS ai_auto_procurement(account_id uuid PRIMARY KEY REFERENCES ai_accounts(id),policy jsonb NOT NULL,version int NOT NULL DEFAULT 1,updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS ai_auto_procurement_runs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),account_id uuid NOT NULL REFERENCES ai_accounts(id),day date NOT NULL,state text NOT NULL DEFAULT 'pending',net_cents int NOT NULL DEFAULT 0,error text,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(account_id,day));
`)}
export async function runAutomaticProcurement(user,{db=aiPool(),draft=procurementDraft,cart=cartTransaction,now=new Date()}={}){
 const today=berlinClock(now).date,policyRow=(await db.query('SELECT * FROM ai_auto_procurement WHERE account_id=$1',[user.id])).rows[0];if(!policyRow?.policy.enabled)return {state:'disabled'};
 const policy=policyRow.policy;
 const run=(await db.query('INSERT INTO ai_auto_procurement_runs(account_id,day) VALUES($1,$2) ON CONFLICT(account_id,day) DO UPDATE SET day=EXCLUDED.day RETURNING *',[user.id,today])).rows[0];if(run.state==='ordered')return {state:'ordered',replayed:true,netCents:run.net_cents};
 try{
  const deliveryDate=new Date(Date.parse(today+'T12:00:00Z')+policy.leadDays*86400000).toISOString().slice(0,10);
  const plan=await draft(user,{mode:'procurement',days:policy.days,deliveryDate,allowedSuppliers:policy.supplierIds});if(!plan.complete)fail('Nicht vollständig automatisch bestellfähig: '+plan.unresolved.map(x=>x.reason).join(' · '),409);if(!plan.lines.length){await db.query("UPDATE ai_auto_procurement_runs SET state='no_need',error=NULL,updated_at=now() WHERE id=$1 AND state<>'ordered'",[run.id]);return {state:'no_need'}}
  const lines=plan.lines.map(({stockId,productId,packs})=>({stockId,productId,packs}));
  const preview=await cart(db,user,{lines,deliveryDate},{checkout:false});if(!preview.canOrder)fail(preview.warnings.join(' · '),409);
  const result=await cart(db,user,{lines,deliveryDate,quote:preview.quote,requestKey:run.id,confirmed:true},{
   authorize:async(c,quote)=>{
    const current=(await c.query('SELECT * FROM ai_auto_procurement WHERE account_id=$1 FOR UPDATE',[user.id])).rows[0];
    if(!current?.policy.enabled||current.version!==policyRow.version)fail('Freigabe inzwischen geändert',409);
    if(quote.groups.some(g=>!policy.supplierIds.includes(g.supplierId)||JSON.stringify([g.deliveryArea,g.terms,g.minimumCents])!==JSON.stringify(policy.supplierTerms?.[g.supplierId])))fail('Lieferant nicht freigegeben',409);
    if(quote.netCents>policy.maxDailyNetCents)fail('Netto-Warenwertgrenze überschritten',409);
    const fresh=await draft(user,{mode:'procurement',days:policy.days,deliveryDate,allowedSuppliers:policy.supplierIds},{db:c});
    const normalized=x=>JSON.stringify(x.map(({stockId,productId,packs})=>[stockId,productId,packs]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))));
    if(!fresh.complete||normalized(fresh.lines)!==normalized(lines))fail('Lagerbedarf oder offene Bestellungen inzwischen geändert',409);
    const existing=(await c.query('SELECT state FROM ai_auto_procurement_runs WHERE id=$1 FOR UPDATE',[run.id])).rows[0];if(existing.state==='ordered')fail('Tagesbestellung bereits ausgeführt',409);
   },
   onCreated:async(c,{quote,orders})=>{
    await c.query("UPDATE ai_auto_procurement_runs SET state='ordered',net_cents=$2,error=NULL,updated_at=now() WHERE id=$1",[run.id,quote.netCents]);
    await c.query("INSERT INTO ai_audit(actor_id,action,detail) VALUES($1,'automatic_procurement_ordered',$2::jsonb)",[user.id,JSON.stringify({runId:run.id,policyVersion:policyRow.version,netCents:quote.netCents,orders:orders.map(o=>o.id)})]);
   }
  });return {state:'ordered',orders:result.orders,netCents:preview.quote.netCents};
 }catch(e){await db.query("UPDATE ai_auto_procurement_runs SET state='blocked',error=$2,updated_at=now() WHERE id=$1 AND state<>'ordered'",[run.id,String(e.message).slice(0,1000)]);return {state:'blocked',error:e.message}}
}
let running=false;
export async function automaticProcurementTick(){if(running)return;running=true;try{const accounts=(await aiPool().query("SELECT a.id,a.role FROM ai_auto_procurement p JOIN ai_accounts a ON a.id=p.account_id WHERE p.policy->>'enabled'='true' AND a.role='restaurant' AND a.status='active'")).rows;for(const u of accounts)await runAutomaticProcurement(u)}finally{running=false}}
export async function automaticProcurementRoutes(path,method,b,user){
 if(user.role!=='restaurant')fail('Nur Restaurants können Beschaffung freigeben',403);const db=aiPool();
 if(path.endsWith('/run')&&method==='POST')return runAutomaticProcurement(user);
 if(method==='GET')return {policy:(await db.query('SELECT policy,version FROM ai_auto_procurement WHERE account_id=$1',[user.id])).rows[0]||null,runs:(await db.query('SELECT * FROM ai_auto_procurement_runs WHERE account_id=$1 ORDER BY day DESC LIMIT 30',[user.id])).rows,suppliers:(await db.query("SELECT id,business_name,delivery_area,delivery_terms FROM ai_accounts WHERE status='active' AND role IN ('dealer','wholesaler','manufacturer') ORDER BY business_name LIMIT 500")).rows};
 if(method==='POST'){
  if(b.enabled===false&&!b.supplierIds){await db.query("UPDATE ai_auto_procurement SET policy=jsonb_set(policy,'{enabled}','false'),version=version+1,updated_at=now() WHERE account_id=$1",[user.id]);await db.query("INSERT INTO ai_audit(actor_id,action) VALUES($1,'automatic_procurement_disabled')",[user.id]);return {ok:true}}
  const policy=procurementPolicy(b);const suppliers=await db.query("SELECT id,delivery_area,delivery_terms,minimum_order_cents FROM ai_accounts WHERE id=ANY($1::uuid[]) AND status='active' AND role IN ('dealer','wholesaler','manufacturer')",[policy.supplierIds]);if(suppliers.rowCount!==policy.supplierIds.length)fail('Lieferantenliste prüfen');policy.supplierTerms=Object.fromEntries(suppliers.rows.map(s=>[s.id,[s.delivery_area,s.delivery_terms,Number(s.minimum_order_cents)]]));
  await db.query('INSERT INTO ai_auto_procurement(account_id,policy) VALUES($1,$2) ON CONFLICT(account_id) DO UPDATE SET policy=EXCLUDED.policy,version=ai_auto_procurement.version+1,updated_at=now()',[user.id,JSON.stringify(policy)]);
  await db.query("INSERT INTO ai_audit(actor_id,action,detail) VALUES($1,'automatic_procurement_policy',$2::jsonb)",[user.id,JSON.stringify(policy)]);return {ok:true};
 }
 fail('Methode nicht erlaubt',405);
}
