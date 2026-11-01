import QRCode from 'qrcode';
import {orderingModuleAccess} from './module-catalog.js';
import {singleByteRange} from './byte-range.js';
import {matchesDisplayMedia} from './display-media-type.js';
import {readRequestBytes,readJsonObject} from './http-body.js';
import {systemActor} from './system-access.js';
import crypto from 'node:crypto';
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const uuid=s=>typeof s==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
const send=(res,status,data)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(JSON.stringify(data));return true};
export function validateDisplay(b){
 if(!b||typeof b!=='object'||Array.isArray(b))throw Object.assign(Error('Ungültige Bildschirmkonfiguration'),{status:400});
 const name=typeof b.name==='string'?b.name.trim():'';
 if(!name||name.length>80||!['landscape','portrait'].includes(b.orientation)||!['contain','cover'].includes(b.fit)||!Array.isArray(b.playlist)||b.playlist.length>40)throw Object.assign(Error('Name, Format oder Wiedergabeliste ungültig'),{status:400});
 if(b.playlist.some(x=>!x||typeof x!=='object'||Array.isArray(x)))throw Object.assign(Error('Ungültiger Bildschirminhalt'),{status:400});
 if(b.playlist.some(x=>x.seconds===0)&&b.playlist.length!==1)throw Object.assign(Error('Dauerhafte Anzeige benötigt genau ein Bild oder Video'),{status:400});
 const playlist=b.playlist.map(x=>{if(!['menu','image','video'].includes(x.type)||!(x.seconds===0&&x.type!=='menu')&&(!Number.isInteger(x.seconds)||x.seconds<3||x.seconds>600)||x.type!=='menu'&&!uuid(x.mediaId))throw Object.assign(Error('Inhalt oder Anzeigedauer ungültig'),{status:400});if(x.type==='menu'&&x.categoryIds!==undefined&&(!Array.isArray(x.categoryIds)||x.categoryIds.length>100||x.categoryIds.some(id=>!uuid(id))))throw Object.assign(Error('Kategorieauswahl ungültig'),{status:400});return {type:x.type,seconds:x.seconds,...(x.type==='menu'?(x.categoryIds?.length?{categoryIds:[...new Set(x.categoryIds.map(id=>id.toLowerCase()))]}:{}):{mediaId:x.mediaId.toLowerCase()})}});
 const mode=b.mode??'content';if(!['content','pickup'].includes(mode)||mode==='pickup'&&!uuid(b.counterTableId))throw Object.assign(Error('Bitte eine gültige Theke wählen'),{status:400});
 return {name,orientation:b.orientation,fit:b.fit,playlist,mode,includeWalkIn:mode==='pickup'&&b.includeWalkIn===true,counterTableId:mode==='pickup'?b.counterTableId:null};
}
export async function migrateDisplays(pool){await pool.query(`CREATE TABLE IF NOT EXISTS pos_displays(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,name text NOT NULL,orientation text NOT NULL,fit text NOT NULL,playlist jsonb NOT NULL DEFAULT '[]',token text NOT NULL UNIQUE,updated_at timestamptz NOT NULL DEFAULT now());CREATE TABLE IF NOT EXISTS pos_display_media(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,mime text NOT NULL,content bytea NOT NULL,created_at timestamptz NOT NULL DEFAULT now());ALTER TABLE pos_displays ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'content';ALTER TABLE pos_displays ADD COLUMN IF NOT EXISTS counter_table_id uuid;ALTER TABLE pos_displays ADD COLUMN IF NOT EXISTS walkin_since timestamptz;CREATE UNIQUE INDEX IF NOT EXISTS pos_displays_one_walkin ON pos_displays(restaurant_id) WHERE walkin_since IS NOT NULL;ALTER TABLE orders ADD COLUMN IF NOT EXISTS pickup_collected_at timestamptz;CREATE INDEX IF NOT EXISTS pos_displays_restaurant ON pos_displays(restaurant_id);CREATE INDEX IF NOT EXISTS pos_display_media_restaurant ON pos_display_media(restaurant_id);`)}
export async function displayAccess(pool,companyId){
 const rows=(await pool.query("SELECT feature_code FROM company_features WHERE company_id=$1 AND status='active' AND (ends_at IS NULL OR ends_at>now() OR grace_until>now())",[companyId])).rows;
 const f=new Set(rows.map(r=>r.feature_code));if(f.has('restaurant'))return true;
 if(!f.has('display_control'))return false;
 return f.has('pos_base')||Boolean((await pool.query("SELECT 1 FROM company_entitlements ce JOIN billing_plans bp ON bp.id=ce.plan_id WHERE ce.company_id=$1 AND bp.code='download_license' AND ce.status='active'",[companyId])).rowCount);
}
export function createDisplays(pool){
 async function owner(req,res){const raw=String(req.headers.authorization||'').replace(/^Bearer /,'');const u=raw?(await pool.query("SELECT u.id,u.company_id,u.role,s.token_hash FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now() AND u.status='active' AND NOT coalesce(u.must_change_password,false)",[hash(raw)])).rows[0]:null;
 if(!u){send(res,401,{error:'Nicht angemeldet'});return null}if(!['owner','admin'].includes(u.role)){send(res,403,{error:'Keine Verwaltungsberechtigung'});return null}
 const unlock=String(req.headers['x-personnel-unlock']||'');if(!unlock||!(await pool.query("UPDATE personnel_unlocks SET expires_at=now()+interval '3 minutes' WHERE token_hash=$1 AND session_hash=$2 AND user_id=$3 AND expires_at>now() RETURNING token_hash",[hash(unlock),u.token_hash,u.id])).rowCount){send(res,403,{error:'Verwaltungs-PIN erforderlich'});return null}return u}

 return async(req,res)=>{const url=new URL(req.url,'http://local'),platform=url.pathname.startsWith('/api/v1/platform/displays'),p=platform?url.pathname.replace('/api/v1/platform/displays','/api/v1/displays'):url.pathname;if(!p.startsWith('/api/v1/displays')&&!p.startsWith('/api/v1/display-player/'))return false;
 try{
 const player=p.match(/^\/api\/v1\/display-player\/([a-f0-9]{48})(?:\/media\/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}))?$/);
 if(player&&(req.method==='GET'||req.method==='HEAD'&&player[2])){
 const d=(await pool.query('SELECT d.*,r.company_id,r.name restaurant_name,r.logo_data restaurant_logo FROM pos_displays d JOIN restaurants r ON r.id=d.restaurant_id WHERE d.token=$1',[player[1]])).rows[0];if(!d)return send(res,404,{error:'Bildschirm nicht verbunden'});if(!await displayAccess(pool,d.company_id))return send(res,403,{error:'Displaysteuerung nicht aktiv',code:'MODULE_REQUIRED'});
 if(player[2]){if(!d.playlist.some(x=>x.mediaId===player[2]))return send(res,404,{error:'Medium nicht freigegeben'});const m=(await pool.query('SELECT mime,content FROM pos_display_media WHERE id=$1 AND restaurant_id=$2',[player[2],d.restaurant_id])).rows[0];if(!m)return send(res,404,{error:'Medium nicht gefunden'});const length=m.content.length,range=singleByteRange(req.headers['if-range']?'':req.headers.range,length);if(range.status===416){res.writeHead(416,{'content-range':'bytes */'+length,'accept-ranges':'bytes','content-length':0});res.end();return true}const {start,end,status}=range;res.writeHead(status,{'content-type':m.mime,'content-length':end-start+1,'accept-ranges':'bytes',...(status===206?{'content-range':`bytes ${start}-${end}/${length}`} : {}),'cache-control':'private, max-age=60','x-content-type-options':'nosniff'});res.end(req.method==='HEAD'?undefined:m.content.subarray(start,end+1));return true}
 if(d.mode==='pickup'){
 const table=(await pool.query('SELECT t.id,t.name,t.qr_token,r.qr_service_mode FROM dining_tables t JOIN restaurants r ON r.id=t.restaurant_id WHERE t.id=$1 AND t.restaurant_id=$2',[d.counter_table_id,d.restaurant_id])).rows[0];
 if(!table||table.qr_service_mode!=='pickup'||!await orderingModuleAccess(pool,d.company_id,'pickup'))return send(res,409,{error:'Thekenzuordnung oder Tresen-QR-Modul prüfen'});
 const orders=(await pool.query("SELECT id,qr_ready_at,status FROM orders WHERE restaurant_id=$1 AND (table_id=$2 OR (table_id IS NULL AND source='pos' AND $3::timestamptz IS NOT NULL AND created_at>=$3 AND NOT EXISTS(SELECT 1 FROM pos_trade_sales ts WHERE ts.order_id=orders.id))) AND pickup_collected_at IS NULL AND status NOT IN ('cancelled','served') AND created_at>now()-interval '24 hours' ORDER BY created_at,id LIMIT 100",[d.restaurant_id,table.id,d.walkin_since])).rows;
 const qr=table.qr_token?await QRCode.toDataURL((process.env.PUBLIC_BASE_URL||'https://bringness.de').replace(/\/$/,'')+'/tisch/?code='+encodeURIComponent(table.qr_token),{width:260,margin:2}):null;
 return send(res,200,{mode:'pickup',name:d.name,restaurantName:d.restaurant_name,restaurantLogo:typeof d.restaurant_logo==='string'&&d.restaurant_logo.length<=200000&&/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(d.restaurant_logo)?d.restaurant_logo:null,orientation:d.orientation,counterName:table.name,qr,orders:orders.map(o=>({number:o.id.slice(0,8).toUpperCase(),ready:!!o.qr_ready_at||o.status==='ready'}))});
 }
 const products=(await pool.query('SELECT p.id,p.name,p.price_cents,p.category_id,c.name category FROM products p LEFT JOIN categories c ON c.id=p.category_id WHERE p.restaurant_id=$1 AND p.active=true AND p.ai_stock_available=true ORDER BY c.sort_order,c.name,p.name LIMIT 250',[d.restaurant_id])).rows;
 return send(res,200,{name:d.name,restaurantName:d.restaurant_name,orientation:d.orientation,fit:d.fit,playlist:d.playlist,products,updatedAt:d.updated_at});
 }
 const rid=url.searchParams.get('restaurantId');const u=platform?await systemActor(pool,req,res,rid):await owner(req,res);if(!u)return true;if(!uuid(rid)||!(await pool.query('SELECT id FROM restaurants WHERE id=$1 AND company_id=$2',[rid,u.company_id])).rowCount)return send(res,404,{error:'Betrieb nicht gefunden'});if(!await displayAccess(pool,u.company_id))return send(res,403,{error:'Displaysteuerung nicht aktiv. Bitte unter Lizenz & Abo buchen.',code:'MODULE_REQUIRED'});
 if(p==='/api/v1/displays/counters'&&req.method==='GET')return send(res,200,{counters:(await pool.query("SELECT t.id,t.name FROM dining_tables t JOIN restaurants r ON r.id=t.restaurant_id WHERE t.restaurant_id=$1 AND r.qr_service_mode='pickup' ORDER BY t.name",[rid])).rows});
 const action=p.match(/^\/api\/v1\/displays\/pickup\/([a-f0-9-]{36})\/(ready|collected)$/);
 if(action&&req.method==='POST'){
 if(!uuid(action[1]))return send(res,404,{error:'Bestellung nicht gefunden'});
 const order=(await pool.query("SELECT o.id,o.qr_ready_at,o.status FROM orders o WHERE o.id=$1 AND o.restaurant_id=$2 AND o.pickup_collected_at IS NULL AND o.status NOT IN ('cancelled','served') AND EXISTS(SELECT 1 FROM pos_displays d WHERE d.restaurant_id=o.restaurant_id AND d.mode='pickup' AND (d.counter_table_id=o.table_id OR (o.table_id IS NULL AND o.source='pos' AND d.walkin_since IS NOT NULL AND o.created_at>=d.walkin_since AND NOT EXISTS(SELECT 1 FROM pos_trade_sales ts WHERE ts.order_id=o.id))) AND EXISTS(SELECT 1 FROM restaurants r WHERE r.id=d.restaurant_id AND r.qr_service_mode='pickup'))",[action[1],rid])).rows[0];
 if(!order)return send(res,404,{error:'Keine zugeordnete Thekenbestellung'});
 if(action[2]==='ready'&&!['preparing','ready','paid'].includes(order.status))return send(res,409,{error:'Zuerst Annahme und Zubereitungsstart bestätigen'});
 if(action[2]==='collected'&&!order.qr_ready_at&&order.status!=='ready')return send(res,409,{error:'Bestellung ist noch nicht abholbereit'});
 const result=await pool.query(action[2]==='ready'?"UPDATE orders SET qr_ready_at=coalesce(qr_ready_at,now()) WHERE id=$1 AND restaurant_id=$2 AND pickup_collected_at IS NULL AND status IN ('preparing','ready','paid') RETURNING id":"UPDATE orders SET pickup_collected_at=now() WHERE id=$1 AND restaurant_id=$2 AND pickup_collected_at IS NULL AND status NOT IN ('cancelled','served') AND (qr_ready_at IS NOT NULL OR status='ready') RETURNING id",[order.id,rid]);
 return send(res,result.rowCount?200:409,result.rowCount?{ok:true}:{error:'Bestellstatus geändert. Bitte aktualisieren.'});
 }
 if(p==='/api/v1/displays/pickup'&&req.method==='GET')return send(res,200,{orders:(await pool.query("SELECT o.id,o.status,o.qr_ready_at,coalesce(t.name,'Kasse / Theke') counter_name FROM orders o LEFT JOIN dining_tables t ON t.id=o.table_id WHERE o.restaurant_id=$1 AND o.pickup_collected_at IS NULL AND o.status NOT IN ('cancelled','served') AND o.created_at>now()-interval '24 hours' AND EXISTS(SELECT 1 FROM pos_displays d WHERE d.restaurant_id=o.restaurant_id AND d.mode='pickup' AND (d.counter_table_id=o.table_id OR (o.table_id IS NULL AND o.source='pos' AND d.walkin_since IS NOT NULL AND o.created_at>=d.walkin_since AND NOT EXISTS(SELECT 1 FROM pos_trade_sales ts WHERE ts.order_id=o.id))) AND EXISTS(SELECT 1 FROM restaurants r WHERE r.id=d.restaurant_id AND r.qr_service_mode='pickup')) ORDER BY o.created_at,o.id LIMIT 100",[rid])).rows});
 if(platform&&p==='/api/v1/displays/catalog'&&req.method==='GET'){
 const [restaurants,categories,products]=await Promise.all([
 pool.query('SELECT id,name FROM restaurants WHERE id=$1',[rid]),
 pool.query('SELECT id,name,restaurant_id AS "restaurantId" FROM categories WHERE restaurant_id=$1 ORDER BY sort_order,name',[rid]),
 pool.query('SELECT id,name,restaurant_id AS "restaurantId",category_id AS "categoryId",price_cents::numeric/100 AS price FROM products WHERE restaurant_id=$1 AND active=true AND ai_stock_available=true ORDER BY name',[rid])]);
 return send(res,200,{restaurants:restaurants.rows,categories:categories.rows,products:products.rows});
 }
 if(p==='/api/v1/displays'&&req.method==='GET')return send(res,200,{displays:(await pool.query('SELECT id,name,orientation,fit,playlist,token,mode,counter_table_id AS "counterTableId",(walkin_since IS NOT NULL) AS "includeWalkIn" FROM pos_displays WHERE restaurant_id=$1 ORDER BY name',[rid])).rows});
 if(p==='/api/v1/displays/media'&&req.method==='GET'){
 const [media,displays]=await Promise.all([pool.query('SELECT id,mime,created_at FROM pos_display_media WHERE restaurant_id=$1 ORDER BY created_at DESC,id LIMIT 500',[rid]),pool.query('SELECT id,name,playlist FROM pos_displays WHERE restaurant_id=$1',[rid])]);
 return send(res,200,{media:media.rows.map(m=>({...m,type:m.mime.startsWith('video/')?'video':'image',usedBy:displays.rows.filter(d=>d.playlist.some(x=>x.mediaId===m.id)).map(d=>({id:d.id,name:d.name}))}))});
 }
 const mediaId=p.match(/^\/api\/v1\/displays\/media\/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/i)?.[1]?.toLowerCase();
 if(mediaId&&req.method==='DELETE'){
 const c=await pool.connect();try{
 await c.query('BEGIN');await c.query('SELECT id FROM restaurants WHERE id=$1 FOR UPDATE',[rid]);
 const media=await c.query('SELECT id FROM pos_display_media WHERE id=$1 AND restaurant_id=$2 FOR UPDATE',[mediaId,rid]);
 if(!media.rowCount){await c.query('ROLLBACK');return send(res,404,{error:'Medium nicht gefunden'})}
 const affected=(await c.query('SELECT id,name,playlist FROM pos_displays WHERE restaurant_id=$1 FOR UPDATE',[rid])).rows.filter(d=>d.playlist.some(x=>x.mediaId===mediaId));
 for(const d of affected)await c.query('UPDATE pos_displays SET playlist=$2::jsonb,updated_at=now() WHERE id=$1',[d.id,JSON.stringify(d.playlist.filter(x=>x.mediaId!==mediaId))]);
 await c.query('DELETE FROM pos_display_media WHERE id=$1 AND restaurant_id=$2',[mediaId,rid]);await c.query('COMMIT');
 return send(res,200,{ok:true,affectedScreens:affected.map(d=>({id:d.id,name:d.name})),message:'Datei vom Server gelöscht. Bildschirme ohne zugewiesenen Inhalt zeigen automatisch die Speisekarte.'});
 }catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}
 }

 if(p==='/api/v1/displays/media'&&req.method==='POST'){
 const mime=String(req.headers['content-type']||'').split(';')[0];if(!['image/png','image/jpeg','image/webp','video/mp4','video/webm'].includes(mime))return send(res,400,{error:'Bitte PNG, JPEG, WebP, MP4 oder WebM hochladen'});
 const content=await readRequestBytes(req,{maxBytes:25*1024*1024});if(!content.length)return send(res,400,{error:'Datei ist leer'});if(!matchesDisplayMedia(mime,content))return send(res,400,{error:'Dateiinhalt passt nicht zum angegebenen Bild- oder Videoformat'});
 // Keep uploads bounded per venue; inactive replacement media remain within the quota.
 const c=await pool.connect();try{await c.query('BEGIN');await c.query('SELECT id FROM restaurants WHERE id=$1 FOR UPDATE',[rid]);const q=await c.query('SELECT coalesce(sum(octet_length(content)),0)::bigint bytes FROM pos_display_media WHERE restaurant_id=$1',[rid]);if(Number(q.rows[0].bytes)+content.length>250*1024*1024){await c.query('ROLLBACK');return send(res,413,{error:'Medienlimit von 250 MB erreicht'})}const m=(await c.query('INSERT INTO pos_display_media(restaurant_id,mime,content) VALUES($1,$2,$3) RETURNING id',[rid,mime,content])).rows[0];await c.query('COMMIT');return send(res,201,{id:m.id,type:mime.startsWith('video/')?'video':'image'})}catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}
 }
 const id=p.match(/^\/api\/v1\/displays\/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/i)?.[1]?.toLowerCase();
 if((p==='/api/v1/displays'&&req.method==='POST')||(id&&req.method==='PUT')){
 let b;try{b=await readJsonObject(req,{maxBytes:20000})}catch(e){if(e.status)throw e;return send(res,400,{error:'Ungültige Anfrage'})}const d=validateDisplay(b);const c=await pool.connect();try{await c.query('BEGIN');await c.query('SELECT id FROM restaurants WHERE id=$1 FOR UPDATE',[rid]);const reject=async(status,data)=>{await c.query('ROLLBACK');return send(res,status,data)};if(d.mode==='pickup'){if(!await orderingModuleAccess(c,u.company_id,'pickup'))return await reject(402,{error:'Nicht gespeichert: Das Tresen-QR-Modul und Tischsystem müssen aktiv sein.'});const table=(await c.query("UPDATE dining_tables t SET qr_token=coalesce(nullif(t.qr_token,''),$3) FROM restaurants r WHERE t.restaurant_id=r.id AND t.id=$1 AND t.restaurant_id=$2 AND r.qr_service_mode='pickup' RETURNING t.id",[d.counterTableId,rid,crypto.randomBytes(24).toString('hex')])).rows[0];if(!table)return await reject(400,{error:'Nicht gespeichert: Bitte eine Theke dieses Betriebs wählen und das Bestellmodell Tresen aktivieren.'});}if(d.includeWalkIn&&(await c.query('SELECT id FROM pos_displays WHERE restaurant_id=$1 AND walkin_since IS NOT NULL AND id<>coalesce($2::uuid,gen_random_uuid())',[rid,id||null])).rowCount)return await reject(409,{error:'Kassenverkäufe sind bereits einem anderen Bildschirm zugeordnet. Dort zuerst ausschalten.'});const categoryIds=[...new Set(d.playlist.flatMap(x=>x.categoryIds||[]))];if(categoryIds.length){const categories=(await c.query('SELECT id FROM categories WHERE restaurant_id=$1 AND id=ANY($2::uuid[])',[rid,categoryIds])).rows;if(categoryIds.some(id=>!categories.some(c=>c.id===id)))return await reject(400,{error:'Kategorie gehört nicht zum Betrieb oder wurde entfernt'})}const ids=d.playlist.filter(x=>x.mediaId).map(x=>x.mediaId);if(ids.length){const media=(await c.query('SELECT id,mime FROM pos_display_media WHERE restaurant_id=$1 AND id=ANY($2::uuid[])',[rid,ids])).rows;if(d.playlist.some(x=>x.mediaId&&!media.some(m=>m.id===x.mediaId&&m.mime.startsWith(x.type==='video'?'video/':'image/'))))return await reject(400,{error:'Medium gehört nicht zum Betrieb oder Format stimmt nicht'})}
 const q=id?await c.query('UPDATE pos_displays SET name=$1,orientation=$2,fit=$3,playlist=$4,mode=$7,counter_table_id=$8,walkin_since=CASE WHEN $9::boolean THEN coalesce(walkin_since,now()) ELSE NULL END,updated_at=now() WHERE id=$5 AND restaurant_id=$6 RETURNING id,token',[d.name,d.orientation,d.fit,JSON.stringify(d.playlist),id,rid,d.mode,d.counterTableId,d.includeWalkIn]):await c.query('INSERT INTO pos_displays(restaurant_id,name,orientation,fit,playlist,token,mode,counter_table_id,walkin_since) VALUES($1,$2,$3,$4,$5,$6,$7,$8,CASE WHEN $9::boolean THEN now() ELSE NULL END) RETURNING id,token',[rid,d.name,d.orientation,d.fit,JSON.stringify(d.playlist),crypto.randomBytes(24).toString('hex'),d.mode,d.counterTableId,d.includeWalkIn]);if(!q.rowCount)return await reject(404,{error:'Bildschirm nicht gefunden'});await c.query('COMMIT');return send(res,id?200:201,q.rows[0]);}catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}
 }
 if(id&&req.method==='DELETE'){const q=await pool.query('DELETE FROM pos_displays WHERE id=$1 AND restaurant_id=$2 RETURNING id',[id,rid]);return send(res,q.rowCount?200:404,q.rowCount?{ok:true}:{error:'Bildschirm nicht gefunden'})}
 return send(res,404,{error:'Bildschirmfunktion nicht gefunden'});
 }catch(e){if(e.status)return send(res,e.status,{error:e.message});throw e}
 }
}

