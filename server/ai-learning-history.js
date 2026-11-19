import {historySourceKey,shiftDay} from './ai-learning-history-core.js';
import {berlinClock} from './ai-forecast-core.js';
import {closedOn,validDay} from './ai-planning-core.js';
import {hash,uuid} from './ai-policy.js';
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
export async function migrateLearningHistory(db){await db.query(`
CREATE TABLE IF NOT EXISTS ai_learning_progress(account_id uuid NOT NULL REFERENCES ai_accounts(id),location_id uuid NOT NULL REFERENCES ai_locations(id),source_key text NOT NULL,earliest_day date NOT NULL,next_day date NOT NULL,review_day date NOT NULL,last_checked_at timestamptz,PRIMARY KEY(account_id,location_id,source_key));
CREATE TABLE IF NOT EXISTS ai_learning_days(account_id uuid NOT NULL REFERENCES ai_accounts(id),location_id uuid NOT NULL REFERENCES ai_locations(id),source_key text NOT NULL,day date NOT NULL,orders bigint,revenue_cents bigint,quality text NOT NULL CHECK(quality IN ('sales','closed','unknown')),products jsonb NOT NULL,consumption jsonb NOT NULL,digest text NOT NULL,revision int NOT NULL DEFAULT 1,first_known_at timestamptz NOT NULL,updated_at timestamptz NOT NULL,PRIMARY KEY(account_id,location_id,source_key,day));
CREATE TABLE IF NOT EXISTS ai_learning_day_revisions(account_id uuid NOT NULL,location_id uuid NOT NULL,source_key text NOT NULL,day date NOT NULL,revision int NOT NULL,recorded_at timestamptz NOT NULL,orders bigint,revenue_cents bigint,quality text NOT NULL,digest text NOT NULL,PRIMARY KEY(account_id,location_id,source_key,day,revision));
CREATE TABLE IF NOT EXISTS ai_learning_forecasts(account_id uuid NOT NULL REFERENCES ai_accounts(id),location_id uuid NOT NULL REFERENCES ai_locations(id),source_key text NOT NULL,issued_day date NOT NULL,target_day date NOT NULL,horizon int NOT NULL CHECK(horizon BETWEEN 0 AND 6),captured_at timestamptz NOT NULL,forecast jsonb NOT NULL,CHECK(target_day-issued_day=horizon),PRIMARY KEY(account_id,location_id,source_key,issued_day,target_day));
CREATE INDEX IF NOT EXISTS ai_learning_forecast_targets ON ai_learning_forecasts(account_id,location_id,source_key,horizon,target_day);
`);}

async function lockedSources(db,source,accountId,locationId){
 if(!uuid.test(String(locationId))||!uuid.test(String(accountId)))fail('Standort erforderlich');
 if(!(await db.query("SELECT l.id FROM ai_locations l JOIN ai_accounts a ON a.id=l.account_id WHERE l.id=$1 AND l.account_id=$2 AND a.status='active' AND a.role='restaurant' FOR SHARE OF l,a",[locationId,accountId])).rowCount)fail('Standort nicht freigegeben',403);
 const links=(await db.query("SELECT c.* FROM ai_connectors c WHERE c.account_id=$1 AND c.location_id=$2 AND c.kind='pos' AND c.active ORDER BY c.id FOR SHARE",[accountId,locationId])).rows;
 if(!links.length)fail('Keine aktive POS-Anbindung',403);
 for(const l of links)if(!(await source.query("SELECT u.id FROM users u JOIN restaurants r ON r.company_id=u.company_id WHERE u.id=$1 AND r.id=$2 AND u.company_id=$3 AND u.status='active' AND u.role IN ('owner','admin') AND NOT COALESCE(u.must_change_password,false) FOR SHARE OF u,r",[l.pos_user_id,l.pos_restaurant_id,l.pos_company_id])).rowCount)fail('Inhaberfreigabe der Kasse nicht mehr gültig',403);
 return {key:historySourceKey(links),ids:[...new Set(links.map(l=>l.pos_restaurant_id))].sort()};
}
export async function readLearningHistory(db,accountId,locationId,key,{year}={}){
 if(year!==undefined&&(!/^\d{4}$/.test(String(year))||Number(year)<1))fail('Gültiges Jahr erforderlich');
 const rows=(await db.query("SELECT to_char(day,'YYYY-MM-DD') AS day,orders::text,revenue_cents::text,quality,revision,first_known_at,updated_at,jsonb_array_length(consumption) consumption_count FROM ai_learning_days WHERE account_id=$1 AND location_id=$2 AND source_key=$3 AND ($4::int IS NULL OR extract(year FROM day)::int=$4) ORDER BY day",[accountId,locationId,key,year===undefined?null:Number(year)])).rows;
 const days=rows.map(r=>({...r,orders:r.orders===null?null:Number(r.orders),revenueCents:r.revenue_cents===null?null:Number(r.revenue_cents),knownAt:new Date(r.updated_at).toISOString()}));
 const years=[...new Set(days.map(d=>d.day.slice(0,4)))].sort().map(year=>({year,observedDays:days.filter(d=>d.day.startsWith(year)&&d.quality==='sales').length,closedDays:days.filter(d=>d.day.startsWith(year)&&d.quality==='closed').length,unknownDays:days.filter(d=>d.day.startsWith(year)&&d.quality==='unknown').length}));
 return {days,years,observedDays:days.filter(d=>d.quality==='sales').length,unknownDays:days.filter(d=>d.quality==='unknown').length,earliestDay:days[0]?.day||null,latestDay:days.at(-1)?.day||null};
}

// All writes are aggregate analytics in the AI database. No order, payment or stock
// writer is invoked. Both source authorization and connector binding stay locked
// until the AI transaction has committed.
export async function syncLearningHistory(db,sourceDb,accountId,locationId,{now=new Date(),batchDays=93}={}){
 if(!Number.isInteger(batchDays)||batchDays<1||batchDays>93)throw Error('Invalid history batch');
 const today=berlinClock(now).date,c=await db.connect();let source,key;
 try{source=await sourceDb.connect()}catch(e){c.release();throw e}
 try{
  await c.query('BEGIN');await c.query("SET LOCAL lock_timeout='750ms'");await c.query("SET LOCAL statement_timeout='10000ms'");
  await source.query('BEGIN ISOLATION LEVEL REPEATABLE READ');await source.query("SET LOCAL lock_timeout='750ms'");await source.query("SET LOCAL statement_timeout='5000ms'");
  const access=await lockedSources(c,source,accountId,locationId);key=access.key;
  const old=(await c.query("SELECT to_char(earliest_day,'YYYY-MM-DD') AS earliest_day,to_char(next_day,'YYYY-MM-DD') AS next_day,to_char(review_day,'YYYY-MM-DD') AS review_day,last_checked_at FROM ai_learning_progress WHERE account_id=$1 AND location_id=$2 AND source_key=$3 FOR UPDATE NOWAIT",[accountId,locationId,key])).rows[0];
  const due=!old?.last_checked_at||now-new Date(old.last_checked_at)>=55*60000;
  let progress=old;
  if(due){
   const earliest=(await source.query("SELECT to_char(min(COALESCE(closed_at,created_at)) AT TIME ZONE 'Europe/Berlin','YYYY-MM-DD') AS earliest FROM orders WHERE restaurant_id=ANY($1::uuid[]) AND status='paid' AND COALESCE(closed_at,created_at)<=$2::timestamptz",[access.ids,now.toISOString()])).rows[0].earliest||today;
   if(!old){await c.query('INSERT INTO ai_learning_progress(account_id,location_id,source_key,earliest_day,next_day,review_day) VALUES($1,$2,$3,$4,$4,$4) ON CONFLICT DO NOTHING',[accountId,locationId,key,earliest]);progress=(await c.query("SELECT to_char(earliest_day,'YYYY-MM-DD') AS earliest_day,to_char(next_day,'YYYY-MM-DD') AS next_day,to_char(review_day,'YYYY-MM-DD') AS review_day,last_checked_at FROM ai_learning_progress WHERE account_id=$1 AND location_id=$2 AND source_key=$3 FOR UPDATE",[accountId,locationId,key])).rows[0];}
   else if(earliest<old.earliest_day)progress={...old,earliest_day:earliest,next_day:earliest};
   const schedule=(await c.query("SELECT to_char(effective_from,'YYYY-MM-DD') AS effective_from,hours FROM ai_plan_schedule_history WHERE location_id=$1 ORDER BY effective_from DESC",[locationId])).rows;
   const settings=(await c.query('SELECT closed_dates FROM ai_plan_settings WHERE location_id=$1',[locationId])).rows[0]||{};
   const importWindow=async(start,end)=>{
    if(start>=end)return;
    const totals=(await source.query(`SELECT to_char(COALESCE(closed_at,created_at) AT TIME ZONE 'Europe/Berlin','YYYY-MM-DD') AS day,count(*) FILTER(WHERE coalesce(to_jsonb(orders)->>'source','')<>'pos_refund')::text AS orders,coalesce(sum(total_cents),0)::text AS revenue_cents FROM orders WHERE restaurant_id=ANY($1::uuid[]) AND status='paid' AND COALESCE(closed_at,created_at)>=($2::date::timestamp AT TIME ZONE 'Europe/Berlin') AND COALESCE(closed_at,created_at)<($3::date::timestamp AT TIME ZONE 'Europe/Berlin') GROUP BY 1`,[access.ids,start,end])).rows;
    const products=(await source.query(`SELECT to_char(COALESCE(o.closed_at,o.created_at) AT TIME ZONE 'Europe/Berlin','YYYY-MM-DD') AS day,oi.product_id::text AS product_code,extract(hour FROM COALESCE(o.closed_at,o.created_at) AT TIME ZONE 'Europe/Berlin')::int AS hour,sum(oi.quantity)::text AS quantity FROM order_items oi JOIN orders o ON o.id=oi.order_id WHERE o.restaurant_id=ANY($1::uuid[]) AND o.status='paid' AND coalesce(to_jsonb(o)->>'source','')<>'pos_refund' AND oi.product_id IS NOT NULL AND COALESCE(o.closed_at,o.created_at)>=($2::date::timestamp AT TIME ZONE 'Europe/Berlin') AND COALESCE(o.closed_at,o.created_at)<($3::date::timestamp AT TIME ZONE 'Europe/Berlin') GROUP BY 1,2,3 ORDER BY 1,2,3 LIMIT 100001`,[access.ids,start,end])).rows;
    const consumption=(await c.query(`SELECT to_char(e.occurred_at AT TIME ZONE 'Europe/Berlin','YYYY-MM-DD') AS day,e.stock_id,s.unit,(-sum(e.delta))::text AS quantity FROM ai_consumption_events e JOIN ai_stock s ON s.id=e.stock_id AND s.account_id=e.account_id WHERE e.account_id=$1 AND s.location_id=$2 AND e.occurred_at>=($3::date::timestamp AT TIME ZONE 'Europe/Berlin') AND e.occurred_at<($4::date::timestamp AT TIME ZONE 'Europe/Berlin') GROUP BY 1,2,3 ORDER BY 1,2 LIMIT 100001`,[accountId,locationId,start,end])).rows;
    if(products.length>100000||consumption.length>100000)throw Error('Learning history window exceeds safe limit');
    const totalsMap=new Map(totals.map(t=>[t.day,t])),productMap=new Map(),consumptionMap=new Map();
    for(const [rows,map] of [[products,productMap],[consumption,consumptionMap]])for(const r of rows){const n=Number(r.quantity);if(!Number.isFinite(n))throw Error('Invalid history quantity');if(!map.has(r.day))map.set(r.day,[]);const {day,...item}=r;map.get(day).push({...item,quantity:n});}
    for(let day=start;day<end;day=shiftDay(day,1)){
     const t=totalsMap.get(day),version=schedule.find(v=>v.effective_from<=day),closed=closedOn(day,{hours:version?.hours||null,closedDates:settings.closed_dates||[]});
     const quality=t?'sales':closed?'closed':'unknown',orders=t?Number(t.orders):closed?0:null,revenueCents=t?Number(t.revenue_cents):closed?0:null;
     if(orders!==null&&(!Number.isSafeInteger(orders)||orders<0)||revenueCents!==null&&!Number.isSafeInteger(revenueCents))throw Error('Invalid learning history totals');
     const p=productMap.get(day)||[],use=consumptionMap.get(day)||[],digest=hash(JSON.stringify({orders,revenueCents,quality,products:p,consumption:use}));
     const r=await c.query(`INSERT INTO ai_learning_days(account_id,location_id,source_key,day,orders,revenue_cents,quality,products,consumption,digest,first_known_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10,$11,$11) ON CONFLICT(account_id,location_id,source_key,day) DO UPDATE SET orders=EXCLUDED.orders,revenue_cents=EXCLUDED.revenue_cents,quality=EXCLUDED.quality,products=EXCLUDED.products,consumption=EXCLUDED.consumption,digest=EXCLUDED.digest,revision=ai_learning_days.revision+1,updated_at=EXCLUDED.updated_at WHERE ai_learning_days.digest<>EXCLUDED.digest RETURNING revision`,[accountId,locationId,key,day,orders,revenueCents,quality,JSON.stringify(p),JSON.stringify(use),digest,now.toISOString()]);
     if(r.rowCount)await c.query('INSERT INTO ai_learning_day_revisions(account_id,location_id,source_key,day,revision,recorded_at,orders,revenue_cents,quality,digest) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[accountId,locationId,key,day,r.rows[0].revision,now.toISOString(),orders,revenueCents,quality,digest]);
    }
   };
   const cursor=progress.next_day<today?progress.next_day:progress.review_day<today?progress.review_day:progress.earliest_day;
   const end=shiftDay(cursor,batchDays)<today?shiftDay(cursor,batchDays):today;
   await importWindow(cursor,end);
   const recentStart=shiftDay(today,-14)>progress.earliest_day?shiftDay(today,-14):progress.earliest_day;
   if(recentStart<today&&(recentStart<cursor||end<today))await importWindow(recentStart,today);
   if(progress.next_day<today)progress.next_day=end;else progress.review_day=end>=today?progress.earliest_day:end;
   await c.query('UPDATE ai_learning_progress SET earliest_day=$4,next_day=$5,review_day=$6,last_checked_at=$7 WHERE account_id=$1 AND location_id=$2 AND source_key=$3',[accountId,locationId,key,progress.earliest_day,progress.next_day,progress.review_day,now.toISOString()]);
  }
  await c.query('COMMIT');await source.query('COMMIT');
  const history=await readLearningHistory(db,accountId,locationId,key);return {key,...history,importComplete:progress?.next_day>=today,importThrough:progress?.next_day?shiftDay(progress.next_day,-1):null,checkedAt:now.toISOString()};
 }catch(e){await c.query('ROLLBACK').catch(()=>{});await source.query('ROLLBACK').catch(()=>{});throw e;}
 finally{source.release();c.release();}
}

export async function captureLearningForecast(db,accountId,locationId,key,issuedDay,targetDay,forecast,{now=new Date()}={}){
 if(!key||!forecast.ready||!validDay(issuedDay)||!validDay(targetDay))return;
 const horizon=Math.round((Date.parse(targetDay)-Date.parse(issuedDay))/86400000);
 if(horizon<0||horizon>6||horizon===0&&(forecast.currentOrders!==0||berlinClock(now).hour>9))return;
 await db.query('INSERT INTO ai_learning_forecasts(account_id,location_id,source_key,issued_day,target_day,horizon,captured_at,forecast) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb) ON CONFLICT DO NOTHING',[accountId,locationId,key,issuedDay,targetDay,horizon,now.toISOString(),JSON.stringify(forecast)]);
}
export async function learningSamples(db,accountId,locationId,key,horizon,today){
 if(!key)return [];
 return (await db.query("SELECT to_char(f.target_day,'YYYY-MM-DD') AS day,f.captured_at,d.updated_at AS actual_known_at,d.orders::text AS actual,f.forecast FROM ai_learning_forecasts f JOIN ai_learning_days d ON d.account_id=f.account_id AND d.location_id=f.location_id AND d.source_key=f.source_key AND d.day=f.target_day WHERE f.forecast->>'modelVersion'='multiyear-v1' AND f.account_id=$1 AND f.location_id=$2 AND f.source_key=$3 AND f.horizon=$4 AND f.target_day<$5::date AND d.quality='sales' ORDER BY f.target_day",[accountId,locationId,key,horizon,today])).rows.map(r=>({day:r.day,hour:horizon?0:berlinClock(new Date(r.captured_at)).hour,currentOrders:r.forecast.currentOrders||0,baseline:r.forecast.baselineOrders,observation:r.forecast.observation,actual:Number(r.actual),capturedAt:new Date(r.captured_at).toISOString(),actualKnownAt:new Date(r.actual_known_at).toISOString()}));
}
