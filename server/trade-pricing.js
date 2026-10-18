import crypto from 'node:crypto';
import {readJsonObject} from './http-body.js';
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
export const tradeQuantityLimit=999999;
export function tradeRecipient(value){
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Rechnungsempfänger erforderlich');
 const r={};for(const [key,max]of Object.entries({name:160,street:160,postalCode:20,city:100,country:80,vatId:40})){
  if(value[key]!=null&&typeof value[key]!=='string')throw Error('Ungültiger Rechnungsempfänger');r[key]=(value[key]||'').trim();if(r[key].length>max||/[\x00-\x1f\x7f]/.test(r[key]))throw Error('Ungültiger Rechnungsempfänger');
 }if(['name','street','postalCode','city','country'].some(k=>!r[k]))throw Error('Name und vollständige Rechnungsadresse erforderlich');return r;
}
export function normalizeTradeTiers(tiers){
 if(!Array.isArray(tiers)||tiers.length>20)throw Error('Maximal 20 Preisstaffeln möglich');
 const result=tiers.map(t=>{if(!t||!Number.isSafeInteger(t.minQty)||t.minQty<1||t.minQty>tradeQuantityLimit||!Number.isSafeInteger(t.priceCents)||t.priceCents<1||t.priceCents>2147483647)throw Error('Menge und Bruttopreis der Staffel ungültig');return {minQty:t.minQty,priceCents:t.priceCents}}).sort((a,b)=>a.minQty-b.minQty);
 if(result.some((t,i)=>i&&t.minQty===result[i-1].minQty))throw Error('Mengenstufen müssen eindeutig sein');return result;
}
export function tradePrice(tiers,quantity){return [...tiers].filter(t=>t.minQty<=quantity).sort((a,b)=>b.minQty-a.minQty)[0]?.priceCents??null;}
export async function migrateTrade(db){await db.query(`ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS pos_trade_enabled boolean NOT NULL DEFAULT false;CREATE TABLE IF NOT EXISTS pos_trade_prices(product_id uuid NOT NULL REFERENCES products(id),min_qty int NOT NULL CHECK(min_qty BETWEEN 1 AND 999999),price_cents int NOT NULL CHECK(price_cents>0),PRIMARY KEY(product_id,min_qty));CREATE TABLE IF NOT EXISTS pos_trade_sales(order_id uuid PRIMARY KEY REFERENCES orders(id),recipient jsonb NOT NULL);`)}
export function createTradeHandler(pool,authenticate){return async(req,res)=>{
 const url=new URL(req.url,'http://local');if(!['/api/v1/trade/prices','/api/v1/trade/invoices','/api/v1/trade/settings'].includes(url.pathname))return false;
 const send=(status,data)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(data));return true};
 const u=await authenticate(req);if(!u)return send(401,{error:'Nicht angemeldet'});if(!['owner','admin','manager'].includes(u.role))return send(403,{error:'Kein Verwaltungszugang'});
 if(url.pathname.endsWith('/settings')){
  if(!['GET','PUT'].includes(req.method))return send(405,{error:'Methode nicht erlaubt'});
  let b;try{b=req.method==='GET'?{restaurantId:url.searchParams.get('restaurantId')}:await readJsonObject(req,{maxBytes:1024});if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(b.restaurantId||'')||(req.method==='PUT'&&typeof b.enabled!=='boolean'))throw Error('Betrieb und gültigen Schalter angeben')}catch(e){return send(400,{error:e.message})}
  if(req.method==='GET'){const r=await pool.query('SELECT pos_trade_enabled FROM restaurants WHERE id=$1 AND company_id=$2',[b.restaurantId,u.company_id]);return r.rows.length?send(200,{enabled:r.rows[0].pos_trade_enabled}):send(404,{error:'Betrieb nicht gefunden'});}
  if(!['owner','admin'].includes(u.role))return send(403,{error:'Nur Inhaber oder Administratoren dürfen die Händleroption umschalten'});
  const c=await pool.connect();try{await c.query('BEGIN');const actor=await authenticate(req,c,true);if(!actor||actor.id!==u.id||actor.company_id!==u.company_id||!['owner','admin'].includes(actor.role))throw Object.assign(Error('Zugang nicht mehr aktiv'),{status:403});
   const unlock=String(req.headers['x-personnel-unlock']||''),session=String(req.headers.authorization||'').replace(/^Bearer /,'');
   if(!unlock||!(await c.query('SELECT 1 FROM personnel_unlocks WHERE token_hash=$1 AND session_hash=$2 AND user_id=$3 AND expires_at>now() FOR SHARE',[hash(unlock),hash(session),u.id])).rows.length)throw Object.assign(Error('Verwaltungs-PIN erforderlich'),{status:403});
   const r=await c.query('UPDATE restaurants SET pos_trade_enabled=$3 WHERE id=$1 AND company_id=$2 RETURNING pos_trade_enabled',[b.restaurantId,u.company_id,b.enabled]);if(!r.rows.length)throw Object.assign(Error('Betrieb nicht gefunden'),{status:404});await c.query('COMMIT');return send(200,{enabled:r.rows[0].pos_trade_enabled});
  }catch(e){await c.query('ROLLBACK');if(e.status)return send(e.status,{error:e.message});throw e}finally{c.release()}
 }
 if(url.pathname.endsWith('/invoices')){if(req.method!=='GET')return send(405,{error:'Methode nicht erlaubt'});const rid=url.searchParams.get('restaurantId');if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(rid||''))return send(400,{error:'Betrieb erforderlich'});const r=await pool.query('SELECT rc.id,rc.receipt_number,rc.issued_at,o.total_cents FROM pos_trade_sales t JOIN orders o ON o.id=t.order_id JOIN receipts rc ON rc.order_id=o.id JOIN restaurants r ON r.id=o.restaurant_id WHERE r.id=$1 AND r.company_id=$2 ORDER BY rc.issued_at DESC,rc.id DESC LIMIT 200',[rid,u.company_id]);return send(200,{invoices:r.rows});}
 if(req.method==='GET'){const rid=url.searchParams.get('restaurantId');if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(rid||''))return send(400,{error:'Betrieb erforderlich'});const rows=await pool.query('SELECT t.product_id,t.min_qty,t.price_cents FROM pos_trade_prices t JOIN products p ON p.id=t.product_id JOIN restaurants r ON r.id=p.restaurant_id WHERE r.id=$1 AND r.company_id=$2 ORDER BY t.product_id,t.min_qty',[rid,u.company_id]);return send(200,{tiers:rows.rows});}
 if(req.method!=='PUT')return send(405,{error:'Methode nicht erlaubt'});
 let b,tiers;try{b=await readJsonObject(req,{maxBytes:8192});tiers=normalizeTradeTiers(b.tiers);if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(b.productId||''))throw Error('Artikel erforderlich')}catch(e){return send(400,{error:e.message})}
 const unlock=String(req.headers['x-personnel-unlock']||''),session=String(req.headers.authorization||'').replace(/^Bearer /,'');
 const c=await pool.connect();try{await c.query('BEGIN');const actor=await authenticate(req,c,true);if(!actor||actor.id!==u.id||actor.company_id!==u.company_id||!['owner','admin','manager'].includes(actor.role))throw Object.assign(Error('Zugang nicht mehr aktiv'),{status:403});
 if(!unlock||!(await c.query('SELECT 1 FROM personnel_unlocks WHERE token_hash=$1 AND session_hash=$2 AND user_id=$3 AND expires_at>now() FOR SHARE',[hash(unlock),hash(session),u.id])).rows.length)throw Object.assign(Error('Verwaltungs-PIN erforderlich'),{status:403});
 if(!(await c.query('SELECT p.id FROM products p JOIN restaurants r ON r.id=p.restaurant_id WHERE p.id=$1 AND r.company_id=$2 AND p.active=true FOR UPDATE OF p',[b.productId,u.company_id])).rows.length)throw Object.assign(Error('Artikel nicht gefunden'),{status:404});
 await c.query('DELETE FROM pos_trade_prices WHERE product_id=$1',[b.productId]);for(const t of tiers)await c.query('INSERT INTO pos_trade_prices VALUES($1,$2,$3)',[b.productId,t.minQty,t.priceCents]);await c.query('COMMIT');return send(200,{ok:true});
 }catch(e){await c.query('ROLLBACK');if(e.status)return send(e.status,{error:e.message});throw e}finally{c.release()}
};}
