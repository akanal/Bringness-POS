import {lineDiscount} from './sale-discount.js';
import {decodeAccountantCursor} from './accountant-cursor.js';
import {readJsonObject} from './http-body.js';
import pg from 'pg';
import crypto from 'node:crypto';
import {validDay} from './ai-planning-core.js';
import {offlineUuid} from './offline-sale-core.js';
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.NODE_ENV==='production'?{rejectUnauthorized:false}:false});
const hash=t=>crypto.createHash('sha256').update(t).digest('hex');
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status})};
export async function migrateAccountantAccess(db=pool){await db.query(`
ALTER TABLE receipts ADD COLUMN IF NOT EXISTS recorded_at timestamptz NOT NULL DEFAULT now();
CREATE TABLE IF NOT EXISTS accountant_grants(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid NOT NULL REFERENCES companies(id),restaurant_id uuid NOT NULL REFERENCES restaurants(id),actor_id uuid NOT NULL REFERENCES users(id),token_hash text NOT NULL UNIQUE,label text NOT NULL,from_day date NOT NULL,to_day date NOT NULL,expires_at timestamptz NOT NULL,revoked_at timestamptz,created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS accountant_grants_company ON accountant_grants(company_id,created_at DESC);
`)}
async function accountantWrite(db,owner,token,work){
 const c=await db.connect();try{
  await c.query('BEGIN');
  if(!(await c.query("SELECT 1 FROM users WHERE id=$1 AND company_id=$2 AND status='active' AND role IN ('owner','admin') AND NOT coalesce(must_change_password,false) FOR SHARE",[owner.id,owner.company_id])).rowCount)fail('Betriebsverwaltung nicht mehr freigegeben',403);
  if(!(await c.query('SELECT 1 FROM sessions WHERE token_hash=$1 AND user_id=$2 AND expires_at>clock_timestamp() FOR SHARE',[hash(token),owner.id])).rowCount)fail('Sitzung nicht mehr aktiv',401);
  const result=await work(c);await c.query('COMMIT');return result;
 }catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}
}
async function accountantRead(db,owner,token,work){
 if(owner&&['owner','admin'].includes(owner.role))return accountantWrite(db,owner,token,work);
 const c=await db.connect();try{
  await c.query('BEGIN');
  const scope=(await c.query('SELECT * FROM accountant_grants WHERE token_hash=$1 AND revoked_at IS NULL AND expires_at>clock_timestamp() FOR SHARE',[hash(token)])).rows[0];
  if(!scope)fail('Zugang fehlt, wurde widerrufen oder ist abgelaufen',401);
  const result=await work(c,scope);await c.query('COMMIT');return result;
 }catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}
}
export function accountantHandler(db){return async(req,res)=>{
 const url=new URL(req.url,'http://local'),p=url.pathname;if(!p.startsWith('/api/v1/accountant/'))return false;
 const send=(status,data)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','referrer-policy':'no-referrer','x-content-type-options':'nosniff','x-robots-tag':'noindex, nofollow'});res.end(JSON.stringify(data));return true};
 try{
  const token=/^Bearer ([^\s]{1,512})$/i.exec(req.headers.authorization||'')?.[1];
  if(!token)return send(401,{error:'Zugang fehlt, wurde widerrufen oder ist abgelaufen'});
  const owner=(await db.query("SELECT u.id,u.company_id,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now() AND u.status='active' AND NOT coalesce(u.must_change_password,false)",[hash(token)])).rows[0];
  const admin=owner&&['owner','admin'].includes(owner.role);
  const exportPaths=['/api/v1/accountant/receipts','/api/v1/accountant/deposit-returns','/api/v1/accountant/cash-closings'];
  if(exportPaths.includes(p)&&req.method!=='GET')return send(405,{error:'Dieser Zugang erlaubt ausschließlich Lesen'});
  if(exportPaths.includes(p)&&req.method==='GET'){
   const allowed=new Set(['restaurantId','from','to','cursor']);
   for(const key of url.searchParams.keys())if(!allowed.has(key)||url.searchParams.getAll(key).length!==1)fail('Ungültige Exportparameter');
   const result=await accountantRead(db,owner,token,async(db,grant)=>{
   const send=(status,data)=>({status,data});
   let scope;
   if(admin){scope={company_id:owner.company_id,restaurant_id:url.searchParams.get('restaurantId'),from_day:url.searchParams.get('from'),to_day:url.searchParams.get('to')};}
   else scope=grant;
   if(!scope)return send(401,{error:'Zugang fehlt, wurde widerrufen oder ist abgelaufen'});
   const day=v=>v instanceof Date?v.toISOString().slice(0,10):String(v);scope.from_day=day(scope.from_day);scope.to_day=day(scope.to_day);
   if(!offlineUuid.test(scope.restaurant_id||'')||!validDay(scope.from_day)||!validDay(scope.to_day)||scope.from_day>scope.to_day)fail('Betrieb und gültiger Zeitraum erforderlich');
   if(!admin&&[['restaurantId',scope.restaurant_id],['from',scope.from_day],['to',scope.to_day]].some(([key,value])=>url.searchParams.has(key)&&url.searchParams.get(key)!==value))fail('Exportparameter überschreiten die Freigabe',403);
   if(!(await db.query('SELECT 1 FROM restaurants WHERE id=$1 AND company_id=$2 FOR SHARE',[scope.restaurant_id,scope.company_id])).rowCount)fail('Betrieb nicht zugänglich',403);
   const binding=hash(JSON.stringify([scope.company_id,scope.restaurant_id,scope.from_day,scope.to_day,scope.id||'owner',...(p.endsWith('/deposit-returns')?['deposit-returns']:p.endsWith('/cash-closings')?['cash-closings']:[])]));
   const rawCursor=url.searchParams.get('cursor'),cursor=rawCursor?decodeAccountantCursor(rawCursor,binding):null;
   const asOf=cursor?.asOf||(await db.query(`SELECT to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS as_of`)).rows[0].as_of;
   if(p.endsWith('/cash-closings')){
    const meta={restaurantId:scope.restaurant_id,from:scope.from_day,to:scope.to_day,asOf,officialDsfinvk:false};
    if(!(await db.query("SELECT to_regclass('pos_cash_sessions') present")).rows[0]?.present)return send(200,{...meta,closings:[],nextCursor:null});
    const rows=(await db.query(`SELECT cs.id,cs.opened_at,to_char(cs.closed_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') closed_at,cs.opening_cents,cs.report FROM pos_cash_sessions cs JOIN restaurants r ON r.id=cs.restaurant_id WHERE r.company_id=$1 AND r.id=$2 AND cs.closed_at IS NOT NULL AND (cs.closed_at AT TIME ZONE 'Europe/Berlin')::date BETWEEN $3::date AND $4::date AND cs.closed_at<=$5::timestamptz AND ($6::timestamptz IS NULL OR (cs.closed_at,cs.id)>($6::timestamptz,$7::uuid)) ORDER BY cs.closed_at,cs.id LIMIT 101`,[scope.company_id,scope.restaurant_id,scope.from_day,scope.to_day,asOf,cursor?.date||null,cursor?.id||null])).rows;
    const page=rows.slice(0,100),last=page.at(-1);
    const closings=page.map(s=>{
     const r=s.report;if(!r||!['expectedCents','countedCents','differenceCents'].every(k=>Number.isSafeInteger(r[k]))||!Array.isArray(r.payments)||!Array.isArray(r.movements))fail('Gespeicherter Kassenabschluss muss geprüft werden',409);
     const openingCents=Number(s.opening_cents);if(!Number.isSafeInteger(openingCents)||r.countedCents-r.expectedCents!==r.differenceCents)fail('Gespeicherter Kassenabschluss muss geprüft werden',409);
     return {id:s.id,opened_at:s.opened_at,closed_at:s.closed_at,openingCents,expectedCents:r.expectedCents,countedCents:r.countedCents,differenceCents:r.differenceCents,reason:r.reason||'',payments:r.payments.map(p=>({method:p.method,mode:p.mode,amount_cents:p.amount_cents})),deposit:r.deposit?{chargedCents:r.deposit.chargedCents,returnedCents:r.deposit.returnedCents}:null,movements:r.movements.map(m=>({id:m.id,action:m.action,amount_cents:m.amount_cents,reason:m.reason,created_at:m.created_at}))};
    });
    return send(200,{...meta,closings,nextCursor:rows.length>100?Buffer.from(JSON.stringify({binding,asOf,date:last.closed_at,id:last.id})).toString('base64url'):null});
   }
   if(p.endsWith('/deposit-returns')){
    if(!(await db.query("SELECT to_regclass('pos_deposit_returns') present")).rows[0]?.present)return send(200,{returns:[],asOf,nextCursor:null,officialDsfinvk:false});
    const rows=(await db.query(`SELECT d.*,to_char(d.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') cursor_created_at FROM pos_deposit_returns d JOIN restaurants r ON r.id=d.restaurant_id WHERE r.company_id=$1 AND r.id=$2 AND (d.created_at AT TIME ZONE 'Europe/Berlin')::date BETWEEN $3::date AND $4::date AND d.created_at<=$5::timestamptz AND ($6::timestamptz IS NULL OR (d.created_at,d.id)>($6::timestamptz,$7::uuid)) ORDER BY d.created_at,d.id LIMIT 101`,[scope.company_id,scope.restaurant_id,scope.from_day,scope.to_day,asOf,cursor?.date||null,cursor?.id||null])).rows;
    const more=rows.length>100,page=rows.slice(0,100),last=page.at(-1);return send(200,{returns:page,asOf,officialDsfinvk:false,nextCursor:more?Buffer.from(JSON.stringify({binding,asOf,date:last.cursor_created_at,id:last.id})).toString('base64url'):null});
   }
   const rows=(await db.query(`SELECT rc.id,rc.receipt_number,rc.issued_at,to_char(rc.issued_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_issued_at,rc.fiscal_status,rc.merchant_snapshot,to_jsonb(rc)->'sale_adjustment' AS sale_adjustment,o.id order_id,o.total_cents,o.source,
    COALESCE((SELECT jsonb_agg(jsonb_build_object('id',i.id,'productId',i.product_id,'name',i.product_name_snapshot,'quantity',i.quantity,'unitPriceCents',i.unit_price_cents,'taxRate',i.tax_rate_snapshot) ORDER BY i.id) FROM order_items i WHERE i.order_id=o.id),'[]') items,
    COALESCE((SELECT jsonb_agg(jsonb_build_object('method',pm.method,'amountCents',pm.amount_cents) ORDER BY pm.id) FROM payments pm WHERE pm.order_id=o.id),'[]') payments
    FROM receipts rc JOIN orders o ON o.id=rc.order_id JOIN restaurants r ON r.id=o.restaurant_id WHERE r.company_id=$1 AND r.id=$2 AND (rc.issued_at AT TIME ZONE 'Europe/Berlin')::date BETWEEN $3::date AND $4::date AND rc.recorded_at<=$5::timestamptz AND ($6::timestamptz IS NULL OR (rc.issued_at,rc.id)>($6::timestamptz,$7::uuid)) ORDER BY rc.issued_at,rc.id LIMIT 101`,[scope.company_id,scope.restaurant_id,scope.from_day,scope.to_day,asOf,cursor?.date||null,cursor?.id||null])).rows;
   const more=rows.length>100,receipts=rows.slice(0,100),last=receipts.at(-1);
   return send(200,{restaurantId:scope.restaurant_id,from:scope.from_day,to:scope.to_day,asOf,officialDsfinvk:false,receipts:receipts.map(({cursor_issued_at,...receipt})=>({...receipt,items:receipt.items.map(i=>({...i,discountCents:lineDiscount(receipt.sale_adjustment,i.productId),lineTotalCents:Math.round(Number(i.quantity)*Number(i.unitPriceCents))-lineDiscount(receipt.sale_adjustment,i.productId)})),issued_at:cursor_issued_at})),nextCursor:more?Buffer.from(JSON.stringify({binding,asOf,date:last.cursor_issued_at,id:last.id})).toString('base64url'):null});
   });
   return send(result.status,result.data);
  }
  if(!admin)return send(owner?403:401,{error:'Nur die Betriebsverwaltung kann Zugänge verwalten'});
  if(p==='/api/v1/accountant/grants'&&req.method==='GET')return send(200,await accountantWrite(db,owner,token,async c=>({grants:(await c.query('SELECT id,restaurant_id,label,from_day,to_day,expires_at,revoked_at FROM accountant_grants WHERE company_id=$1 ORDER BY created_at DESC LIMIT 100',[owner.company_id])).rows})));
  if(req.method!=='POST'||!['/api/v1/accountant/grants','/api/v1/accountant/revoke'].includes(p))return send(405,{error:'Methode nicht erlaubt'});
  const b=await readJsonObject(req,{maxBytes:4096});
  if(p==='/api/v1/accountant/grants'&&req.method==='POST'){
   if(typeof b.restaurantId!=='string'||!offlineUuid.test(b.restaurantId)||!validDay(b.from)||!validDay(b.to)||b.from>b.to)fail('Betrieb und gültiger Zeitraum erforderlich');
   if(!Number.isInteger(b.days)||b.days<1||b.days>30)fail('Zugang für 1 bis 30 Tage freigeben');const label=String(b.label||'').trim();if(!label||label.length>100)fail('Bezeichnung mit höchstens 100 Zeichen erforderlich');
   const result=await accountantWrite(db,owner,token,async c=>{
    if(!(await c.query('SELECT 1 FROM restaurants WHERE id=$1 AND company_id=$2 FOR SHARE',[b.restaurantId,owner.company_id])).rowCount)fail('Betrieb nicht zugänglich',403);
    const secret=crypto.randomBytes(32).toString('base64url'),expires=new Date(Date.now()+b.days*86400000).toISOString();
    const grant=(await c.query('INSERT INTO accountant_grants(company_id,restaurant_id,actor_id,token_hash,label,from_day,to_day,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id,expires_at',[owner.company_id,b.restaurantId,owner.id,hash(secret),label,b.from,b.to,expires])).rows[0];
    await c.query("INSERT INTO audit_log(company_id,actor_user_id,event_type,entity_type,entity_id,payload) VALUES($1,$2,'accountant_access_created','accountant_grant',$3,$4)",[owner.company_id,owner.id,grant.id,JSON.stringify({restaurantId:b.restaurantId,from:b.from,to:b.to,expires})]);
    return {...grant,token:secret};
   });
   return send(201,result);
  }
  if(p==='/api/v1/accountant/revoke'&&req.method==='POST'){
   if(typeof b.id!=='string'||!offlineUuid.test(b.id))fail('Ungültige Zugangskennung');
   const result=await accountantWrite(db,owner,token,async c=>{
    const grant=(await c.query('SELECT id,revoked_at FROM accountant_grants WHERE id=$1 AND company_id=$2 FOR UPDATE',[b.id,owner.company_id])).rows[0];if(!grant)fail('Zugang nicht gefunden',404);
    if(grant.revoked_at)return {ok:true,replayed:true};
    await c.query('UPDATE accountant_grants SET revoked_at=now() WHERE id=$1 AND company_id=$2',[b.id,owner.company_id]);
    await c.query("INSERT INTO audit_log(company_id,actor_user_id,event_type,entity_type,entity_id) VALUES($1,$2,'accountant_access_revoked','accountant_grant',$3)",[owner.company_id,owner.id,b.id]);
    return {ok:true};
   });return send(200,result);
  }
  return send(405,{error:'Methode nicht erlaubt'});
 }catch(e){return send(e.status||503,{error:e.status?e.message:'Steuerberaterzugang momentan nicht verfügbar'});}
}}
export const handleAccountantAccess=accountantHandler(pool);
