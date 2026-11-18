import crypto from 'node:crypto';
import {readJsonObject} from './http-body.js';
import {registerImage} from './online-register-tools.js';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const digest=value=>crypto.createHash('sha256').update(value||'').digest('hex');
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
export function createProductPhotos(pool){return async(req,res)=>{
 const url=new URL(req.url,'http://localhost'),match=url.pathname.match(/^\/api\/v1\/products\/([^/]+)\/image$/);if(!match)return false;
 const send=(status,data)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(JSON.stringify(data));return true;};let c;
 try{
  const token=/^Bearer ([^\s]{1,512})$/i.exec(req.headers.authorization||'')?.[1];if(!token)fail('Bitte anmelden.',401);
  if(!['GET','PUT'].includes(req.method))fail('Methode nicht erlaubt.',405);
  if(!uuid.test(match[1]))fail('Ungültiger Artikel.');
  const b=req.method==='PUT'?await readJsonObject(req,{maxBytes:205000}):Object.fromEntries(url.searchParams);
  if(typeof b.restaurantId!=='string'||!uuid.test(b.restaurantId))fail('Bitte den richtigen Betrieb auswählen.');
  if(req.method==='PUT'&&(url.search||Object.keys(b).some(k=>!['restaurantId','image','expectedVersion'].includes(k))))fail('Ungültige Bildanfrage.');
  if(req.method==='GET'&&([...url.searchParams.keys()].some(k=>k!=='restaurantId')||url.searchParams.getAll('restaurantId').length!==1))fail('Ungültige Bildanfrage.');
  let image;if(req.method==='PUT'){if(typeof b.expectedVersion!=='string'||!/^[a-f0-9]{64}$/.test(b.expectedVersion))fail('Bild bitte zuerst neu laden.');image=registerImage(b.image);}
  c=await pool.connect();await c.query('BEGIN');await c.query("SET LOCAL statement_timeout='5s'");
  const actor=(await c.query(`SELECT u.id,u.company_id FROM sessions s JOIN users u ON u.id=s.user_id
   WHERE s.token_hash=$1 AND s.expires_at>clock_timestamp() AND u.status='active' AND u.role IN ('owner','admin')
   AND NOT coalesce(u.must_change_password,false) FOR SHARE OF s,u`,[digest(token)])).rows[0];
  if(!actor)fail('Keine Berechtigung zur Artikelpflege.',403);
  const p=(await c.query(`SELECT p.id,p.restaurant_id,p.image_url FROM products p JOIN restaurants r ON r.id=p.restaurant_id
   WHERE p.id=$1 AND r.id=$2 AND r.company_id=$3 FOR ${req.method==='PUT'?'UPDATE OF p FOR SHARE OF r':'SHARE OF p,r'}`,[match[1],b.restaurantId,actor.company_id])).rows[0];
  if(!p)fail('Artikel in diesem Betrieb nicht gefunden.',404);
  if(req.method==='PUT'&&image!==(p.image_url||null)){
   if(digest(p.image_url)!==b.expectedVersion)fail('Das Artikelfoto wurde inzwischen geändert. Bitte neu laden und prüfen.',409);
   await c.query('UPDATE products SET image_url=$1 WHERE id=$2',[image,p.id]);
   await c.query("INSERT INTO audit_log(company_id,actor_user_id,event_type,entity_type,entity_id,payload) VALUES($1,$2,'product.image.updated','product',$3,$4)",[actor.company_id,actor.id,p.id,JSON.stringify({hasImage:Boolean(image)})]);p.image_url=image;
  }
  await c.query('COMMIT');return send(200,{id:p.id,restaurantId:p.restaurant_id,image:p.image_url||null,version:digest(p.image_url)});
 }catch(error){if(c)await c.query('ROLLBACK');const status=error.status||503;return send(status,{error:status===503?'Das Artikelfoto konnte nicht gespeichert oder geladen werden. Bitte denselben Vorgang erneut prüfen.':error.message});}finally{c?.release();}
};}
