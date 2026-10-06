const bad=message=>{throw Object.assign(Error(message),{status:400})};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function identifier(value,name,zero=false){if(!value)return '';if(!/^\d{1,19}$/.test(value)||BigInt(value)>9223372036854775807n||(!zero&&BigInt(value)===0n))bad(name+' ist ungültig');return value}
function date(value){if(!value)return '';if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value)bad('Ungültiges Datum');return value}
export function auditFilters(url){
 const get=key=>(url.searchParams.get(key)||'').trim();
 const q=get('q'),actor=get('actor'),action=get('action'),from=date(get('from')),to=date(get('to'));
 if(q.length>150||action.length>100)bad('Suchfilter ist zu lang');if(actor&&!uuid.test(actor))bad('Ungültiger Akteur');if(action&&!/^[a-zA-Z0-9_.-]+$/.test(action))bad('Ungültiger Vorgang');if(from&&to&&from>to)bad('Beginn muss vor dem Ende liegen');
 return {q,actor,action,from,to,before:identifier(get('before'),'Seitenmarke'),snapshot:identifier(get('snapshot'),'Protokollstand',true)};
}
export function safeAuditDetail(value,depth=0){
 if(depth>5)return '[gekürzt]';
 if(typeof value==='string')return value.slice(0,2000);
 if(Array.isArray(value))return value.slice(0,30).map(v=>safeAuditDetail(v,depth+1));
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).slice(0,60).map(([key,v])=>[key,/password|passwort|token|secret|api.?key|smtp|iban|bic|mandate|credential/i.test(key)?'[geschützt]':safeAuditDetail(v,depth+1)]));
 return value;
}
async function actorNames(pool,platformPool,ids){
 const unique=[...new Set(ids.filter(Boolean))];if(!unique.length)return new Map();
 const ai=(await pool.query('SELECT id,name,business_name FROM ai_accounts WHERE id=ANY($1::uuid[])',[unique])).rows;
 const names=new Map(ai.map(a=>[a.id,a.business_name?`${a.name} · ${a.business_name}`:a.name]));
 const missing=unique.filter(id=>!names.has(id));
 if(missing.length){const pos=(await platformPool.query('SELECT id,display_name FROM users WHERE id=ANY($1::uuid[])',[missing])).rows;for(const actor of pos)names.set(actor.id,actor.display_name||actor.id)}
 return names;
}
export async function adminOverview(pool){
 const summary=(await pool.query(`SELECT
  (SELECT count(*)::int FROM ai_accounts WHERE status='pending') pendingVerification,
  (SELECT count(*)::int FROM ai_accounts WHERE status='active' AND role='restaurant') activeRestaurants,
  (SELECT count(*)::int FROM ai_accounts WHERE status='active' AND role IN ('dealer','wholesaler','manufacturer')) activeSuppliers,
  (SELECT count(*)::int FROM ai_ads WHERE status='submitted') adsToReview,
  (SELECT count(*)::int FROM ai_ads WHERE status='accepted') adsToApprove,
  (SELECT count(*)::int FROM ai_fulfilment_alerts WHERE resolved_at IS NULL) openDeliveryIssues,
  (SELECT count(*)::int FROM ai_fulfilment_alerts WHERE resolved_at IS NULL AND acknowledged_at IS NULL) unreadDeliveryIssues,
  (SELECT count(*)::int FROM ai_orders WHERE status='accepted' AND coalesce(confirmed_delivery_date,delivery_date)<(now() AT TIME ZONE 'Europe/Berlin')::date) overdueOrderLines,
  (SELECT coalesce(sum(greatest(o.commission_cents-coalesce(p.amount_cents,0),0)),0)::text FROM ai_orders o LEFT JOIN ai_commission_payments p ON p.order_id=o.id WHERE o.status='received') outstandingCommissionCents,
  (SELECT count(*)::int FROM ai_collection_jobs WHERE state='exception') collectionExceptions,
  (SELECT count(*)::int FROM ai_audit WHERE created_at>=now()-interval '24 hours') changesToday`)).rows[0];
 // Unquoted aliases are lowercase in PostgreSQL; expose stable camelCase keys.
 const result={};for(const name of ['pendingVerification','activeRestaurants','activeSuppliers','adsToReview','adsToApprove','openDeliveryIssues','unreadDeliveryIssues','overdueOrderLines','outstandingCommissionCents','collectionExceptions','changesToday'])result[name]=summary[name.toLowerCase()];
 const overdue=(await pool.query("SELECT o.id,o.product_name,coalesce(o.confirmed_delivery_date,o.delivery_date)::text delivery_date,b.business_name buyer_name,s.business_name supplier_name FROM ai_orders o JOIN ai_accounts b ON b.id=o.buyer_id JOIN ai_accounts s ON s.id=o.supplier_id WHERE o.status='accepted' AND coalesce(o.confirmed_delivery_date,o.delivery_date)<(now() AT TIME ZONE 'Europe/Berlin')::date ORDER BY coalesce(o.confirmed_delivery_date,o.delivery_date),o.id LIMIT 25")).rows;
 return {summary:result,overdue,asOf:new Date().toISOString()};
}
export async function adminAudit(pool,platformPool,url){
 const f=auditFilters(url);
 const maximum=String((await pool.query('SELECT coalesce(max(id),0)::text id FROM ai_audit')).rows[0].id);
 const snapshot=f.snapshot&&BigInt(f.snapshot)<BigInt(maximum)?f.snapshot:maximum;
 const pattern='%'+f.q.replace(/[\\%_]/g,char=>'\\'+char)+'%';
 const platformMatches=f.q?(await platformPool.query('SELECT id FROM users WHERE display_name ILIKE $1 LIMIT 200',[pattern])).rows.map(a=>a.id):[];
 const args=[snapshot,f.actor||null,f.action,f.from||null,f.to||null,f.q,pattern,platformMatches];
 const where=`a.id<=$1::bigint AND ($2::uuid IS NULL OR a.actor_id=$2::uuid) AND ($3='' OR a.action=$3)
 AND ($4::date IS NULL OR a.created_at>=$4::date::timestamp AT TIME ZONE 'Europe/Berlin')
 AND ($5::date IS NULL OR a.created_at<($5::date+1)::timestamp AT TIME ZONE 'Europe/Berlin')
 AND ($6='' OR a.action ILIKE $7 OR a.target_id::text ILIKE $7 OR a.actor_id::text ILIKE $7 OR u.name ILIKE $7 OR u.business_name ILIKE $7 OR a.actor_id=ANY($8::uuid[]))`;
 const join='FROM ai_audit a LEFT JOIN ai_accounts u ON u.id=a.actor_id';
 const total=String((await pool.query('SELECT count(*)::text total '+join+' WHERE '+where,args)).rows[0].total);
 const rows=(await pool.query('SELECT a.* '+join+' WHERE '+where+' AND ($9::bigint IS NULL OR a.id<$9::bigint) ORDER BY a.id DESC LIMIT 51',[...args,f.before||null])).rows;
 const visible=rows.slice(0,50),names=await actorNames(pool,platformPool,visible.map(a=>a.actor_id));
 const actorIds=(await pool.query('SELECT DISTINCT actor_id FROM ai_audit WHERE id<=$1::bigint ORDER BY actor_id LIMIT 200',[snapshot])).rows.map(a=>a.actor_id);
 const options=await actorNames(pool,platformPool,actorIds);
 const actions=(await pool.query('SELECT DISTINCT action FROM ai_audit WHERE id<=$1::bigint ORDER BY action LIMIT 200',[snapshot])).rows.map(a=>a.action);
 return {rows:visible.map(a=>({...a,id:String(a.id),actor_name:names.get(a.actor_id)||a.actor_id,detail:safeAuditDetail(a.detail)})),actors:actorIds.map(id=>({id,name:options.get(id)||id})),actions,total,snapshot,next:rows.length>50?String(visible.at(-1).id):'',asOf:new Date().toISOString()};
}
