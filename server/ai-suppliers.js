import crypto from 'node:crypto';
import {aiPool} from './ai-database.js';
import {hash,uuid,supplierRoles,units} from './ai-policy.js';

const fail=(message,status=400)=>{const error=new Error(message);error.status=status;throw error};
const text=(value,label,max=150)=>{if(typeof value!=='string'||!value.trim()||value.trim().length>max)fail(label+' erforderlich (maximal '+max+' Zeichen)');return value.trim()};
const checkId=value=>{if(!uuid.test(String(value)))fail('Ungültige ID');return value};
export function supplierProducts(payload){
  if(!payload||typeof payload!=='object')fail('Produktimport erforderlich');
  checkId(payload.requestId);
  if(!Array.isArray(payload.products)||!payload.products.length||payload.products.length>100)fail('1 bis 100 Produkte je Import erforderlich');
  const seen=new Set();
  return payload.products.map(p=>{
    if(!p||typeof p!=='object')fail('Ungültiges Produkt');
    const externalCode=text(p.externalCode,'Artikelcode'),name=text(p.name,'Produktname');
    if(seen.has(externalCode))fail('Doppelter Artikelcode im Import');seen.add(externalCode);
    if(!units.includes(p.unit))fail('Einheit kg, l oder piece erforderlich');
    if(typeof p.packQuantity!=='number'||!Number.isFinite(p.packQuantity)||p.packQuantity<=0||p.packQuantity>1000000||Math.abs(p.packQuantity*1000-Math.round(p.packQuantity*1000))>0.00001||(p.unit==='piece'&&!Number.isInteger(p.packQuantity)))fail('Gültige Packungsmenge erforderlich');
    if(!Number.isSafeInteger(p.priceCents)||p.priceCents<0||p.priceCents>100000000)fail('Nettopreis in ganzen Cent erforderlich');
    const minimumPacks=p.minimumPacks??1;
    if(!Number.isSafeInteger(minimumPacks)||minimumPacks<1||minimumPacks>10000)fail('Gültige Mindestpackungszahl erforderlich');
    if(p.active!==undefined&&typeof p.active!=='boolean'||p.available!==undefined&&typeof p.available!=='boolean')fail('Sichtbarkeit und Verfügbarkeit müssen boolesch sein');
    return {externalCode,name,unit:p.unit,packQuantity:p.packQuantity,priceCents:p.priceCents,minimumPacks,active:p.active??true,available:p.available??true};
  }).sort((a,b)=>a.externalCode.localeCompare(b.externalCode));
}

export async function migrateAiSuppliers(){await aiPool().query(`
ALTER TABLE ai_products ADD COLUMN IF NOT EXISTS external_code text;
ALTER TABLE ai_products ADD COLUMN IF NOT EXISTS available boolean NOT NULL DEFAULT true;
CREATE UNIQUE INDEX IF NOT EXISTS ai_supplier_product_code ON ai_products(supplier_id,external_code) WHERE external_code IS NOT NULL;
CREATE TABLE IF NOT EXISTS ai_supplier_connectors(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),supplier_id uuid NOT NULL REFERENCES ai_accounts(id),name text NOT NULL,token_hash text UNIQUE NOT NULL,active boolean NOT NULL DEFAULT false,last_sync timestamptz,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS ai_supplier_imports(connector_id uuid NOT NULL REFERENCES ai_supplier_connectors(id),request_id uuid NOT NULL,fingerprint text NOT NULL,result jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(connector_id,request_id));
CREATE INDEX IF NOT EXISTS ai_supplier_order_cursor ON ai_orders(supplier_id,updated_at,id);
`)}

export async function supplierAccountRoutes(p,method,b,u){
  if(!['/api/ai/supplier-connectors','/api/ai/supplier-connector-key','/api/ai/supplier-connector-status'].includes(p))return null;
  if(!supplierRoles.includes(u.role))fail('Nur Lieferanten können diese Anbindungen verwalten',403);
  const pool=aiPool();
  if(p==='/api/ai/supplier-connectors'&&method==='GET')return {connectors:(await pool.query('SELECT id,name,active,last_sync,created_at FROM ai_supplier_connectors WHERE supplier_id=$1 ORDER BY created_at DESC',[u.id])).rows};
  if(p==='/api/ai/supplier-connectors'&&method==='POST'){
    const name=text(b.name,'Name'),token=crypto.randomBytes(32).toString('hex');
    const r=await pool.query('INSERT INTO ai_supplier_connectors(supplier_id,name,token_hash) VALUES($1,$2,$3) RETURNING id',[u.id,name,hash(token)]);
    return {connectorId:r.rows[0].id,token,message:'Schlüssel nur jetzt sichtbar. Sicher speichern und die Verbindung anschließend aktivieren.'};
  }
  if(method==='POST'){
    checkId(b.id);
    if(p==='/api/ai/supplier-connector-key'){
      const token=crypto.randomBytes(32).toString('hex');
      if(!(await pool.query('UPDATE ai_supplier_connectors SET token_hash=$3 WHERE id=$1 AND supplier_id=$2 RETURNING id',[b.id,u.id,hash(token)])).rowCount)fail('Anbindung nicht gefunden',404);
      return {token,message:'Der bisherige Schlüssel ist sofort ungültig. Den neuen Schlüssel sicher speichern.'};
    }
    if(typeof b.active!=='boolean')fail('Status erforderlich');
    if(!(await pool.query('UPDATE ai_supplier_connectors SET active=$3 WHERE id=$1 AND supplier_id=$2 RETURNING id',[b.id,u.id,b.active])).rowCount)fail('Anbindung nicht gefunden',404);
    return {ok:true};
  }
  fail('Methode nicht erlaubt',405);
}

const productFields='id,external_code,name,unit,pack_quantity,price_cents,minimum_packs,active,available';
export async function supplierPublicRoutes(p,method,url,token,b={}){
  const pool=aiPool();
  const link=(await pool.query("SELECT c.* FROM ai_supplier_connectors c JOIN ai_accounts a ON a.id=c.supplier_id WHERE c.token_hash=$1 AND c.active AND a.status='active' AND a.role IN ('dealer','wholesaler','manufacturer')",[hash(token)])).rows[0];
  if(!link)fail('Ungültiger oder pausierter Lieferanten-Schlüssel',401);
  const count=(await pool.query("INSERT INTO ai_auth_attempts(key,count,expires_at) VALUES($1,1,now()+interval '15 minutes') ON CONFLICT(key) DO UPDATE SET count=CASE WHEN ai_auth_attempts.expires_at<now() THEN 1 ELSE ai_auth_attempts.count+1 END,expires_at=CASE WHEN ai_auth_attempts.expires_at<now() THEN now()+interval '15 minutes' ELSE ai_auth_attempts.expires_at END RETURNING count",[hash('supplier-api:'+link.id)])).rows[0].count;
  if(count>600)fail('Anfragelimit erreicht. Bitte später wiederholen.',429);
  if(p==='/api/ai/v1/supplier/status'&&method==='GET')return {version:'1',connectorId:link.id,lastSync:link.last_sync,commissionBps:200,permissions:['products:read','products:write','orders:read','orders:accept','orders:cancel']};
  if(p==='/api/ai/v1/supplier/products'&&method==='GET'){
    const after=url.searchParams.get('after');if(after)checkId(after);
    const rows=(await pool.query(`SELECT ${productFields} FROM ai_products WHERE supplier_id=$1 AND ($2::uuid IS NULL OR id>$2::uuid) ORDER BY id LIMIT 101`,[link.supplier_id,after])).rows;
    return {products:rows.slice(0,100),nextAfter:rows.length>100?rows[99].id:null};
  }
  if(p==='/api/ai/v1/supplier/products'&&method==='POST'){
    const products=supplierProducts(b),fingerprint=hash(JSON.stringify(products)),c=await pool.connect();
    try{
      await c.query('BEGIN');
      if(!(await c.query("SELECT c.id FROM ai_supplier_connectors c JOIN ai_accounts a ON a.id=c.supplier_id WHERE c.id=$1 AND c.token_hash=$2 AND c.active AND a.status='active' FOR UPDATE OF c",[link.id,hash(token)])).rowCount)fail('Anbindung nicht aktiv',403);
      const old=(await c.query('SELECT fingerprint,result FROM ai_supplier_imports WHERE connector_id=$1 AND request_id=$2',[link.id,b.requestId])).rows[0];
      if(old){if(old.fingerprint!==fingerprint)fail('Import-ID mit abweichenden Daten verwendet',409);await c.query('COMMIT');return {...old.result,duplicate:true}}
      const imported=[];
      for(const p of products){const q=await c.query(`INSERT INTO ai_products(supplier_id,external_code,name,unit,pack_quantity,price_cents,minimum_packs,active,available) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)
        ON CONFLICT(supplier_id,external_code) WHERE external_code IS NOT NULL DO UPDATE SET name=EXCLUDED.name,unit=EXCLUDED.unit,pack_quantity=EXCLUDED.pack_quantity,price_cents=EXCLUDED.price_cents,minimum_packs=EXCLUDED.minimum_packs,active=EXCLUDED.active,available=EXCLUDED.available RETURNING id,external_code`,[link.supplier_id,p.externalCode,p.name,p.unit,p.packQuantity,p.priceCents,p.minimumPacks,p.active,p.available]);imported.push(q.rows[0])}
      const result={imported:imported.length,products:imported};
      await c.query('INSERT INTO ai_supplier_imports VALUES($1,$2,$3,$4,now())',[link.id,b.requestId,fingerprint,JSON.stringify(result)]);
      await c.query('UPDATE ai_supplier_connectors SET last_sync=now() WHERE id=$1',[link.id]);
      await c.query("INSERT INTO ai_audit(actor_id,target_id,action,detail) VALUES($1,$2,'supplier_api_products',$3)",[link.supplier_id,link.id,JSON.stringify({requestId:b.requestId,count:imported.length})]);
      await c.query('COMMIT');return {...result,duplicate:false};
    }catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}
  }
  if(p==='/api/ai/v1/supplier/orders'&&method==='GET'){
    let cursor=null;const raw=url.searchParams.get('cursor');
    if(raw){try{if(raw.length>512)throw Error();cursor=JSON.parse(Buffer.from(raw,'base64url').toString());if(!uuid.test(cursor.id)||typeof cursor.time!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(cursor.time)||!Number.isFinite(Date.parse(cursor.time))||new Date(cursor.time).toISOString().slice(0,19)!==cursor.time.slice(0,19))throw Error()}catch{fail('Ungültiger Cursor')}}
    const orders=(await pool.query(`SELECT o.id,o.product_id,p.external_code,o.product_name,o.unit,o.pack_quantity,o.packs,o.net_cents,o.commission_bps,o.commission_cents,o.status,o.delivery_date,o.delivery_address,o.buyer_email,o.created_at,o.updated_at,to_char(o.updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') cursor_time FROM ai_orders o JOIN ai_products p ON p.id=o.product_id WHERE o.supplier_id=$1 AND ($2::timestamptz IS NULL OR (o.updated_at,o.id)>($2::timestamptz,$3::uuid)) ORDER BY o.updated_at,o.id LIMIT 101`,[link.supplier_id,cursor?.time||null,cursor?.id||null])).rows;
    const page=orders.slice(0,100),last=page.at(-1);
    return {orders:page.map(({cursor_time,...o})=>o),nextCursor:last?Buffer.from(JSON.stringify({time:last.cursor_time,id:last.id})).toString('base64url'):(raw||null),hasMore:orders.length>100};
  }
  const action=p.match(/^\/api\/ai\/v1\/supplier\/orders\/([0-9a-f-]{36})\/(accept|cancel)$/i);
  if(action&&method==='POST'){
    checkId(action[1]);const c=await pool.connect();
    try{await c.query('BEGIN');if(!(await c.query("SELECT c.id FROM ai_supplier_connectors c JOIN ai_accounts a ON a.id=c.supplier_id WHERE c.id=$1 AND c.token_hash=$2 AND c.active AND a.status='active' FOR UPDATE OF c",[link.id,hash(token)])).rowCount)fail('Anbindung nicht aktiv',403);const o=(await c.query('SELECT * FROM ai_orders WHERE id=$1 AND supplier_id=$2 FOR UPDATE',[action[1],link.supplier_id])).rows[0];if(!o)fail('Bestellung nicht gefunden',404);
      const status=action[2]==='accept'?'accepted':'cancelled';
      if(o.status===status){await c.query('COMMIT');return {ok:true,duplicate:true}}
      if(action[2]==='accept'&&o.status!=='sent'||action[2]==='cancel'&&!['sent','accepted'].includes(o.status))fail('Aktion für diesen Bestellstatus nicht möglich',409);
      await c.query("UPDATE ai_orders SET status=$2,updated_at=now(),commission_cents=CASE WHEN $2='cancelled' THEN 0 ELSE commission_cents END WHERE id=$1",[o.id,status]);
      await c.query('INSERT INTO ai_audit(actor_id,target_id,action) VALUES($1,$2,$3)',[link.supplier_id,o.id,'supplier_api_'+status]);
      await c.query('COMMIT');return {ok:true,duplicate:false};
    }catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}
  }
  fail('Lieferanten-API-Funktion nicht gefunden',404);
}
