import {Worker} from 'node:worker_threads';
import {aiPool} from './ai-database.js';
import {documentBytes,textDraft,receiptLines,reject,normalizeName,suggestDelivery} from './ai-delivery-core.js';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
let busy=false;
export async function recognizeDocument(bytes,mime){
 if(busy)reject('Eine Dokumenterkennung läuft bereits. Bitte gleich erneut versuchen.',429);busy=true;
 try{return await new Promise((resolve,rejectPromise)=>{
  const w=new Worker(new URL('./ai-delivery-worker.js',import.meta.url),{execArgv:[],workerData:{bytes,mime},resourceLimits:{maxOldGenerationSizeMb:384}});
  const timer=setTimeout(()=>{w.terminate();rejectPromise(Object.assign(new Error('Die Erkennung dauert zu lange. Bitte erneut versuchen oder manuell erfassen.'),{status:422}));},90000);
  w.once('message',r=>{clearTimeout(timer);w.terminate();r.error?rejectPromise(Object.assign(new Error(r.error),{status:422})):resolve(textDraft(r.text,r.confidence));});
  w.once('error',()=>{clearTimeout(timer);rejectPromise(Object.assign(new Error('Dokumenterkennung derzeit nicht verfügbar'),{status:503}));});
  w.once('exit',code=>{clearTimeout(timer);if(code!==0)rejectPromise(Object.assign(new Error('Dokumenterkennung wurde beendet. Bitte erneut versuchen.'),{status:503}));});
 });}finally{busy=false;}
}
export const deliveryMigration=`
CREATE TABLE IF NOT EXISTS ai_delivery_notes(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),account_id uuid NOT NULL REFERENCES ai_accounts(id),location_id uuid NOT NULL REFERENCES ai_locations(id),document_hash text NOT NULL,document_mime text NOT NULL,document_data bytea NOT NULL,filename text NOT NULL,extraction jsonb NOT NULL,supplier text NOT NULL DEFAULT '',reference text NOT NULL DEFAULT '',delivery_date date,status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','confirmed')),confirmed_at timestamptz,confirmation jsonb,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(account_id,document_hash));
CREATE UNIQUE INDEX IF NOT EXISTS ai_delivery_reference ON ai_delivery_notes(account_id,lower(supplier),lower(reference)) WHERE status='confirmed' AND reference<>'';
CREATE TABLE IF NOT EXISTS ai_delivery_note_lines(id bigserial PRIMARY KEY,note_id uuid NOT NULL REFERENCES ai_delivery_notes(id),stock_id uuid NOT NULL REFERENCES ai_stock(id),unit text NOT NULL,quantity numeric(15,3) NOT NULL,pack_quantity numeric(15,3),net_cents bigint,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS ai_delivery_mappings(account_id uuid NOT NULL REFERENCES ai_accounts(id),location_id uuid NOT NULL REFERENCES ai_locations(id),supplier_key text NOT NULL,supplier_name text NOT NULL,source_key text NOT NULL,stock_id uuid NOT NULL REFERENCES ai_stock(id),pack_quantity numeric(15,3),updated_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(account_id,location_id,supplier_key,source_key));
CREATE OR REPLACE VIEW ai_confirmed_purchase_prices AS
SELECT o.buyer_id account_id,o.stock_id,o.unit,o.net_cents/NULLIF(o.pack_quantity*coalesce(o.delivered_packs,o.packs),0) unit_cents,o.pack_quantity,o.received_at,o.id::text source_id FROM ai_orders o WHERE o.status='received' AND o.received_at IS NOT NULL
UNION ALL SELECT n.account_id,l.stock_id,l.unit,l.net_cents/NULLIF(l.quantity,0),l.pack_quantity,n.confirmed_at,n.id::text FROM ai_delivery_note_lines l JOIN ai_delivery_notes n ON n.id=l.note_id WHERE n.status='confirmed' AND l.net_cents IS NOT NULL;
`;
export async function migrateDeliveryNotes(){await aiPool().query(deliveryMigration);}
function label(v,max){if(typeof v!=='string'||!v.trim()||v.trim().length>max)reject('Lieferant und Lieferscheinnummer erforderlich');return v.trim();}
export async function confirmNote(pool,b,u){
 if(!uuid.test(String(b.id))||b.confirmed!==true||b.allPositionsReviewed!==true||b.externalDelivery!==true)reject('Alle Positionen und tatsächlichen Wareneingang prüfen. Bringness-Bestellungen unter Bestellungen bestätigen.');
 const lines=receiptLines(b.lines),supplier=label(b.supplier,200),reference=label(b.reference,100);
 if(!/^\d{4}-\d{2}-\d{2}$/.test(String(b.deliveryDate))||!Number.isFinite(Date.parse(b.deliveryDate))||new Date(b.deliveryDate).toISOString().slice(0,10)!==b.deliveryDate)reject('Lieferdatum prüfen');
 const confirmation={lines,supplier,reference,deliveryDate:b.deliveryDate};const c=await pool.connect();
 try{await c.query('BEGIN');await c.query('SELECT id FROM ai_accounts WHERE id=$1 FOR UPDATE',[u.id]);
  const note=(await c.query('SELECT * FROM ai_delivery_notes WHERE id=$1 AND account_id=$2 FOR UPDATE',[b.id,u.id])).rows[0];if(!note)reject('Lieferschein nicht gefunden',404);
  if(note.status==='confirmed'){if(JSON.stringify(note.confirmation)!==JSON.stringify(confirmation)&&JSON.stringify(normalize(note.confirmation))!==JSON.stringify(normalize(confirmation)))reject('Bereits mit anderen Angaben gebucht',409);await c.query('COMMIT');return {ok:true,duplicate:true};}
  if((await c.query("SELECT id FROM ai_delivery_notes WHERE account_id=$1 AND lower(supplier)=lower($2) AND lower(reference)=lower($3) AND status='confirmed'",[u.id,supplier,reference])).rowCount)reject('Dieser Lieferschein wurde bereits gebucht',409);
  for(const line of [...lines].sort((a,b)=>a.stockId.localeCompare(b.stockId))){const stock=(await c.query('SELECT * FROM ai_stock WHERE id=$1 AND account_id=$2 AND location_id=$3 FOR UPDATE',[line.stockId,u.id,note.location_id])).rows[0];if(!stock||stock.unit!==line.unit)reject('Artikel oder Einheit passt nicht zum eigenen Standort',409);if(Number(stock.quantity)+line.quantity>999999999999)reject('Bestand ist zu groß');}
  for(const line of lines){await c.query('UPDATE ai_stock SET quantity=quantity+$2 WHERE id=$1',[line.stockId,line.quantity]);await c.query('INSERT INTO ai_stock_moves(stock_id,actor_id,delta,reason) VALUES($1,$2,$3,$4)',[line.stockId,u.id,line.quantity,`Lieferschein ${reference} · ${supplier} · ${note.id}`]);await c.query('INSERT INTO ai_delivery_note_lines(note_id,stock_id,unit,quantity,pack_quantity,net_cents) VALUES($1,$2,$3,$4,$5,$6)',[note.id,line.stockId,line.unit,line.quantity,line.packQuantity,line.netCents]);}
  const learnable=new Map();for(const line of lines){const source=textDraft(note.extraction.text,note.extraction.confidence).lines?.[line.sourceIndex];if(!source||source.header)continue;const key=normalizeName(source.description);if(!key)continue;const previous=learnable.get(key);learnable.set(key,previous&&previous.stockId!==line.stockId?{ambiguous:true}:line);}
  for(const [sourceKey,line] of learnable){if(line.ambiguous)continue;await c.query('INSERT INTO ai_delivery_mappings(account_id,location_id,supplier_key,supplier_name,source_key,stock_id,pack_quantity) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(account_id,location_id,supplier_key,source_key) DO UPDATE SET supplier_name=excluded.supplier_name,stock_id=excluded.stock_id,pack_quantity=excluded.pack_quantity,updated_at=now()',[u.id,note.location_id,normalizeName(supplier),supplier,sourceKey,line.stockId,line.packQuantity]);}
  await c.query("UPDATE ai_delivery_notes SET status='confirmed',supplier=$2,reference=$3,delivery_date=$4,confirmed_at=now(),confirmation=$5 WHERE id=$1",[note.id,supplier,reference,b.deliveryDate,JSON.stringify(confirmation)]);
  await c.query("INSERT INTO ai_audit(actor_id,target_id,action,detail) VALUES($1,$2,'delivery_note_confirmed',$3)",[u.id,note.id,JSON.stringify({positions:lines.length,reference})]);await c.query('COMMIT');return {ok:true,duplicate:false};
 }catch(e){await c.query('ROLLBACK');if(e.code==='23505')reject('Dieser Lieferschein wurde bereits erfasst',409);throw e;}finally{c.release();}
}
function normalize(x){if(Array.isArray(x))return x.map(normalize);if(x&&typeof x==='object')return Object.fromEntries(Object.keys(x).sort().map(k=>[k,normalize(x[k])]));return x;}
export async function deliverySuggestions(pool,accountId,locationId,draft){
 const stocks=(await pool.query('SELECT id,name,unit FROM ai_stock WHERE account_id=$1 AND location_id=$2',[accountId,locationId])).rows;
 const mappings=(await pool.query('SELECT supplier_key,supplier_name,source_key,stock_id,pack_quantity FROM ai_delivery_mappings WHERE account_id=$1 AND location_id=$2',[accountId,locationId])).rows;
 return suggestDelivery(draft,stocks,mappings,[...new Set(mappings.map(m=>m.supplier_name))]);
}
export async function deliveryRoutes(path,method,b,u){
 if(u.role!=='restaurant')reject('Wareneingang nur für Restaurantkonten',403);const pool=aiPool();
 if(path==='/api/ai/delivery-notes'&&method==='GET')return {notes:(await pool.query('SELECT id,location_id,filename,supplier,reference,status,created_at,confirmed_at FROM ai_delivery_notes WHERE account_id=$1 ORDER BY created_at DESC LIMIT 50',[u.id])).rows,stock:(await pool.query('SELECT s.*,l.name location_name FROM ai_stock s JOIN ai_locations l ON l.id=s.location_id WHERE s.account_id=$1',[u.id])).rows,locations:(await pool.query('SELECT id,name FROM ai_locations WHERE account_id=$1 ORDER BY name',[u.id])).rows};
 if(path==='/api/ai/delivery-notes/upload'&&method==='POST'){
  if(!uuid.test(String(b.locationId))||!(await pool.query('SELECT id FROM ai_locations WHERE id=$1 AND account_id=$2',[b.locationId,u.id])).rowCount)reject('Eigenen Standort auswählen',404);
  const d=documentBytes(b),old=(await pool.query('SELECT id,status,location_id,extraction FROM ai_delivery_notes WHERE account_id=$1 AND document_hash=$2',[u.id,d.hash])).rows[0];if(old){if(old.status==='draft')old.extraction=await deliverySuggestions(pool,u.id,old.location_id,textDraft(old.extraction.text,old.extraction.confidence));return {note:old,duplicate:true};}
  const extraction=await deliverySuggestions(pool,u.id,b.locationId,await recognizeDocument(d.bytes,d.mime)),filename=String(b.filename||'Lieferschein').replace(/[\x00-\x1f]/g,'').slice(0,200);
  const note=(await pool.query('INSERT INTO ai_delivery_notes(account_id,location_id,document_hash,document_mime,document_data,filename,extraction) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(account_id,document_hash) DO UPDATE SET document_hash=excluded.document_hash RETURNING id,status,location_id,extraction',[u.id,b.locationId,d.hash,d.mime,d.bytes,filename,JSON.stringify(extraction)])).rows[0];return {note};
 }
 if(path==='/api/ai/delivery-notes/confirm'&&method==='POST')return confirmNote(pool,b,u);
 if(path==='/api/ai/delivery-notes/prices'&&method==='POST'){
  if(!uuid.test(String(b.id))||b.confirmed!==true||!Array.isArray(b.lines)||!b.lines.length||b.lines.length>100)reject('Geprüfte Rechnungspreise bestätigen');
  const c=await pool.connect();try{await c.query('BEGIN');const note=(await c.query("SELECT id FROM ai_delivery_notes WHERE id=$1 AND account_id=$2 AND status='confirmed' FOR UPDATE",[b.id,u.id])).rows[0];if(!note)reject('Gebuchter eigener Lieferschein nicht gefunden',404);
   for(const line of b.lines){if(!Number.isSafeInteger(Number(line.id))||!Number.isSafeInteger(line.netCents)||line.netCents<0||line.netCents>100000000)reject('Positionspreis prüfen');const old=(await c.query('SELECT net_cents FROM ai_delivery_note_lines WHERE id=$1 AND note_id=$2 FOR UPDATE',[line.id,note.id])).rows[0];if(!old)reject('Position nicht gefunden',404);await c.query('UPDATE ai_delivery_note_lines SET net_cents=$2 WHERE id=$1',[line.id,line.netCents]);await c.query("INSERT INTO ai_audit(actor_id,target_id,action,detail) VALUES($1,$2,'delivery_note_price_confirmed',$3)",[u.id,note.id,JSON.stringify({lineId:line.id,before:old.net_cents,netCents:line.netCents})]);}await c.query('COMMIT');return {ok:true};
  }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
 }
 const m=path.match(/^\/api\/ai\/delivery-notes\/([0-9a-f-]+)$/);if(m&&method==='GET'&&uuid.test(m[1])){const note=(await pool.query('SELECT id,location_id,filename,status,supplier,reference,delivery_date,extraction,confirmation,document_mime,encode(document_data,\'base64\') data FROM ai_delivery_notes WHERE id=$1 AND account_id=$2',[m[1],u.id])).rows[0];if(!note)reject('Lieferschein nicht gefunden',404);if(note.status==='draft')note.extraction=await deliverySuggestions(pool,u.id,note.location_id,textDraft(note.extraction.text,note.extraction.confidence));note.lines=(await pool.query('SELECT l.*,s.name FROM ai_delivery_note_lines l JOIN ai_stock s ON s.id=l.stock_id WHERE l.note_id=$1 ORDER BY l.id',[note.id])).rows;return {note};}
 reject('Funktion nicht gefunden',404);
}
