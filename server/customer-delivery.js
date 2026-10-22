import crypto from 'node:crypto';
import {checkAddress} from './address-check.js';
import {readJsonObject} from './http-body.js';
import {tradeRecipient} from './trade-pricing.js';
const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const fail=(status,message)=>Object.assign(Error(message),{status});
export function customerRecord(value){
 const address=tradeRecipient(value);
 if(value.email!=null&&typeof value.email!=='string'||value.phone!=null&&typeof value.phone!=='string')throw Error('Ungültige Kontaktdaten');
 const email=(value.email||'').trim(),phone=(value.phone||'').trim();
 if(typeof value.email!=='undefined'&&typeof value.email!=='string'||typeof value.phone!=='undefined'&&typeof value.phone!=='string')throw Error('Ungültige Kontaktdaten');
 if(email.length>254||email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||phone.length>60||/[\x00-\x1f\x7f]/.test(phone))throw Error('Ungültige Kontaktdaten');
 return {...address,email,phone};
}
export function deliveryRequest(body){
 if(!uuid(body.restaurantId)||!uuid(body.requestKey)||!Array.isArray(body.items)||!body.items.length||body.items.length>100)throw Error('Betrieb, Vorgangskennung und Artikel erforderlich');
 const seen=new Set(),items=body.items.map(i=>{if(!i||!uuid(i.productId)||!Number.isSafeInteger(i.qty)||i.qty<1||i.qty>999999||seen.has(i.productId))throw Error('Ungültige oder doppelte Artikelposition');seen.add(i.productId);return {productId:i.productId,qty:i.qty};});
 const note=body.note??'';if(typeof note!=='string'||note.length>1000||/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(note))throw Error('Ungültige Liefernotiz');
 return {restaurantId:body.restaurantId,requestKey:body.requestKey,recipient:tradeRecipient(body.recipient),items,note};
}
export async function migrateCustomerDelivery(db){await db.query(`
 CREATE TABLE IF NOT EXISTS pos_customers(id uuid PRIMARY KEY,restaurant_id uuid NOT NULL REFERENCES restaurants(id),data jsonb NOT NULL,version int NOT NULL DEFAULT 1,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now());
 CREATE INDEX IF NOT EXISTS pos_customers_restaurant ON pos_customers(restaurant_id);
 CREATE TABLE IF NOT EXISTS pos_delivery_notes(id uuid PRIMARY KEY,restaurant_id uuid NOT NULL REFERENCES restaurants(id),request_key uuid NOT NULL,fingerprint text NOT NULL,number text NOT NULL UNIQUE,sender jsonb NOT NULL,recipient jsonb NOT NULL,items jsonb NOT NULL,note text NOT NULL,created_by uuid NOT NULL REFERENCES users(id),issued_at timestamptz NOT NULL DEFAULT now(),UNIQUE(restaurant_id,request_key));
 CREATE INDEX IF NOT EXISTS pos_delivery_notes_restaurant ON pos_delivery_notes(restaurant_id,issued_at);
 `);}
export function createCustomerDelivery(pool,authenticate){return async(req,res)=>{
 const url=new URL(req.url,'http://local'),path=url.pathname;if(!['/api/v1/customers','/api/v1/delivery-notes','/api/v1/address-check'].includes(path))return false;
 const send=(status,data)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(data));return true;};
 const user=await authenticate(req);if(!user)return send(401,{error:'Nicht angemeldet'});if(!['owner','admin','manager'].includes(user.role))return send(403,{error:'Kein Verwaltungszugang'});
 if(path==='/api/v1/address-check'){
  if(req.method!=='POST')return send(405,{error:'Methode nicht erlaubt'});
  try{const body=await readJsonObject(req,{maxBytes:2048});if(body.complete!=null&&typeof body.complete!=='boolean')throw Error('Ungültige Prüfung');return send(200,checkAddress(body.address,{complete:body.complete===true}));}
  catch(e){return send(e.status===413?413:400,{error:e.status===413?'Anfrage zu groß':e.message});}
 }
 if(!['GET','POST','PUT'].includes(req.method)||path.endsWith('delivery-notes')&&req.method==='PUT')return send(405,{error:'Methode nicht erlaubt'});
 let body;try{body=req.method==='GET'?{restaurantId:url.searchParams.get('restaurantId')}:await readJsonObject(req,{maxBytes:65536});if(!uuid(body.restaurantId))throw Error('Betrieb erforderlich');}catch(e){return send(e.status===413?413:400,{error:e.status===413?'Anfrage zu groß':e.message});}
 const client=await pool.connect();try{
 await client.query('BEGIN');const actor=await authenticate(req,client,true);if(!actor||actor.id!==user.id||actor.company_id!==user.company_id||!['owner','admin','manager'].includes(actor.role))throw fail(403,'Zugang nicht mehr aktiv');
 if(!(await client.query('SELECT id FROM restaurants WHERE id=$1 AND company_id=$2 FOR SHARE',[body.restaurantId,actor.company_id])).rows.length)throw fail(404,'Betrieb nicht gefunden');
 let result;
 if(path.endsWith('/customers')){
  if(req.method==='GET'){
   const q=(url.searchParams.get('q')||'').trim();if(q.length>160)throw fail(400,'Suchtext zu lang');
   result={customers:(await client.query("SELECT id,data,version FROM pos_customers WHERE restaurant_id=$1 AND strpos(lower(concat_ws(' ',data->>'name',data->>'street',data->>'postalCode',data->>'city',data->>'email',data->>'phone',data->>'vatId',data->>'taxNumber')),lower($2))>0 ORDER BY lower(data->>'name'),id LIMIT 200",[body.restaurantId,q])).rows};
  }else{
   let data;try{data=customerRecord(body.customer);}catch(e){throw fail(400,e.message);}
   if(req.method==='POST'){result=(await client.query('INSERT INTO pos_customers(id,restaurant_id,data) VALUES($1,$2,$3) RETURNING id,data,version',[crypto.randomUUID(),body.restaurantId,data])).rows[0];}
   else{if(!uuid(body.id)||!Number.isSafeInteger(body.version)||body.version<1)throw fail(400,'Kunde und Version erforderlich');result=(await client.query('UPDATE pos_customers SET data=$3,version=version+1,updated_at=now() WHERE id=$1 AND restaurant_id=$2 AND version=$4 RETURNING id,data,version',[body.id,body.restaurantId,data,body.version])).rows[0];if(!result)throw fail(409,'Kunde wurde verändert. Bitte neu laden.');}
  }
 }else if(req.method==='GET'){
  const id=url.searchParams.get('id');if(id&&!uuid(id))throw fail(400,'Ungültiger Lieferschein');
  result={deliveryNotes:(await client.query('SELECT id,number,sender,recipient,items,note,issued_at FROM pos_delivery_notes WHERE restaurant_id=$1 AND ($2::uuid IS NULL OR id=$2) ORDER BY issued_at DESC,id DESC LIMIT 200',[body.restaurantId,id])).rows};
 }else{
  let draft;try{draft=deliveryRequest(body);}catch(e){throw fail(400,e.message);}
  const fingerprint=crypto.createHash('sha256').update(JSON.stringify(draft)).digest('hex');
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[draft.restaurantId+':delivery:'+draft.requestKey]);
  const old=(await client.query('SELECT * FROM pos_delivery_notes WHERE restaurant_id=$1 AND request_key=$2',[draft.restaurantId,draft.requestKey])).rows[0];
  if(old){if(old.fingerprint!==fingerprint)throw fail(409,'Vorgangskennung bereits mit anderen Daten verwendet');result={deliveryNote:old};}
  else{
   const products=(await client.query('SELECT id,name FROM products WHERE restaurant_id=$1 AND id=ANY($2::uuid[]) AND active=true FOR SHARE',[draft.restaurantId,draft.items.map(i=>i.productId)])).rows;
   const items=draft.items.map(i=>{const p=products.find(p=>p.id===i.productId);if(!p)throw fail(400,'Artikel nicht mehr verfügbar');return {productId:p.id,name:p.name,qty:i.qty};});
   const sender=(await client.query('SELECT company_name,street,postal_code,city,vat_id FROM company_billing_profiles WHERE company_id=$1',[actor.company_id])).rows[0];
   if(!sender||['company_name','street','postal_code','city'].some(k=>!String(sender[k]||'').trim()))throw fail(400,'Bitte zuerst vollständige Firmenadresse in Lizenz & Abo hinterlegen');
   const id=crypto.randomUUID(),number='LS-'+id.toUpperCase();
   const note=(await client.query('INSERT INTO pos_delivery_notes(id,restaurant_id,request_key,fingerprint,number,sender,recipient,items,note,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id,number,sender,recipient,items,note,issued_at',[id,draft.restaurantId,draft.requestKey,fingerprint,number,sender,draft.recipient,JSON.stringify(items),draft.note,actor.id])).rows[0];result={deliveryNote:note};
  }
 }
 await client.query('COMMIT');return send(200,result);
 }catch(e){await client.query('ROLLBACK');if(e.status)return send(e.status,{error:e.message});throw e;}finally{client.release();}
};}
