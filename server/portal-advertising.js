import {isDeepStrictEqual} from 'node:util';
import {createHash} from 'node:crypto';
import {readJsonObject} from './http-body.js';

const adminPath='/api/v1/platform/advertising';
const publicPath='/api/v1/delivery-portal/advertising';
const uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const text=(value,max)=>typeof value==='string'&&value.trim().length<=max&&!/[\u0000-\u001f]/.test(value);
export function safeAdLink(value){
  if(typeof value!=='string'||value.length>2048)return false;
  try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password;}catch{return false;}
}
export function validateAdvertisement(input){
  if(!input||!uuid.test(input.id||'')||!Number.isInteger(input.version)||input.version<0||
    !text(input.title,100)||!input.title.trim()||!text(input.caption,240)||
    !safeAdLink(input.link)||typeof input.active!=='boolean'||
    !Number.isInteger(input.position)||input.position<0||input.position>99) return null;
  const date=value=>value===null?null:typeof value==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value)&&Number.isFinite(Date.parse(value))?value:false;
  const startsAt=date(input.startsAt),endsAt=date(input.endsAt);
  if(startsAt===false||endsAt===false||(startsAt&&endsAt&&startsAt>=endsAt))return null;
  // Upload is re-encoded to a bounded raster by the admin client. SVG/HTML/remote tracking images are rejected.
  const image=input.image;
  if(typeof image!=='string'||image.length>1400000||!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(image))return null;
  const bytes=Buffer.from(image.slice(image.indexOf(',')+1),'base64');
  if(bytes.length>1024*1024||bytes.length<12)return null;
  const raster= image.startsWith('data:image/png;')?bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):
    image.startsWith('data:image/jpeg;')?bytes[0]===255&&bytes[1]===216&&bytes[2]===255:
    bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP';
  if(!raster)return null;
  return {title:input.title.trim(),caption:input.caption.trim(),image,link:input.link,active:input.active,position:input.position,startsAt,endsAt};
}
export async function migratePortalAdvertising(db){
  await db.query(`CREATE TABLE IF NOT EXISTS portal_advertisements(
    id uuid PRIMARY KEY, version integer NOT NULL, data jsonb NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now(), updated_by uuid NOT NULL REFERENCES users(id))`);
  await db.query(`CREATE TABLE IF NOT EXISTS portal_advertising_audit(
    id bigserial PRIMARY KEY, advertisement_id uuid NOT NULL, version integer NOT NULL,
    actor_user_id uuid NOT NULL REFERENCES users(id), changed_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(advertisement_id,version))`);
}
export function createPortalAdvertising(pool){return async(req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(![adminPath,publicPath].includes(url.pathname))return false;
  const send=(code,data)=>{res.writeHead(code,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(JSON.stringify(data));return true;};
  if(url.pathname===publicPath){
    if(req.method!=='GET')return send(405,{error:'Methode nicht erlaubt.'});
    const {rows}=await pool.query(`SELECT id,data FROM portal_advertisements WHERE data->'active'='true'
      AND (data->>'startsAt' IS NULL OR (data->>'startsAt')::timestamptz<=now())
      AND (data->>'endsAt' IS NULL OR (data->>'endsAt')::timestamptz>now())
      ORDER BY (data->>'position')::int,id LIMIT 6`);
    return send(200,{advertisements:rows.map(({id,data})=>({id,title:data.title,caption:data.caption,image:data.image,link:data.link}))});
  }
  const token=/^Bearer ([^\s]{1,512})$/i.exec(req.headers.authorization||'')?.[1];
  if(!token)return send(401,{error:'Bitte in der Verwaltung anmelden.'});
  if(!['GET','PUT'].includes(req.method))return send(405,{error:'Methode nicht erlaubt.'});
  let input,ad;
  if(req.method==='PUT'){
    try{input=await readJsonObject(req,{maxBytes:1500000});}catch(e){if(e.status)return send(e.status,{error:e.message});throw e;}
    ad=validateAdvertisement(input);if(!ad)return send(400,{error:'Bitte Bild, HTTPS-Link, Texte und Zeitraum prüfen.'});
  }
  const db=await pool.connect();
  try{
    await db.query('BEGIN');
    const {rows:[actor]}=await db.query(`SELECT u.id FROM sessions s JOIN users u ON u.id=s.user_id
      JOIN platform_admins pa ON pa.user_id=u.id AND pa.active=true
      JOIN platform_owner o ON o.user_id=u.id
      WHERE s.token_hash=$1 AND s.expires_at>clock_timestamp() AND u.status='active'
      AND NOT coalesce(u.must_change_password,false) FOR SHARE OF s,u,pa,o`,[createHash('sha256').update(token).digest('hex')]);
    if(!actor){await db.query('ROLLBACK');return send(403,{error:'Werbung ist ausschließlich für den Bringness-Inhaber freigegeben.'});}
    if(req.method==='GET'){
      const {rows}=await db.query('SELECT id,version,data FROM portal_advertisements ORDER BY (data->>\'position\')::int,id LIMIT 100');
      await db.query('COMMIT');return send(200,{advertisements:rows.map(({id,version,data})=>({id,version,...data}))});
    }
    // Serialise creation and edits, including simultaneous first writes of the same UUID.
    await db.query('LOCK TABLE portal_advertisements IN SHARE ROW EXCLUSIVE MODE');
    const {rows:[old]}=await db.query('SELECT version,data FROM portal_advertisements WHERE id=$1 FOR UPDATE',[input.id]);
    if((old?.version??0)!==input.version){
      if(old?.version===input.version+1&&isDeepStrictEqual(old.data,ad)){
        await db.query('COMMIT');return send(200,{advertisement:{id:input.id,version:old.version,...old.data}});
      }
      await db.query('ROLLBACK');return send(409,{error:'Die Anzeige wurde geändert. Bitte den gespeicherten Stand neu laden.'});
    }
    if(!old&&(await db.query('SELECT count(*)::int AS n FROM portal_advertisements')).rows[0].n>=100){await db.query('ROLLBACK');return send(409,{error:'Maximal 100 Anzeigen. Bestehende Anzeigen bearbeiten oder pausieren.'});}
    const version=input.version+1;
    await db.query(`INSERT INTO portal_advertisements(id,version,data,updated_by) VALUES($1,$2,$3::jsonb,$4)
      ON CONFLICT(id) DO UPDATE SET version=EXCLUDED.version,data=EXCLUDED.data,updated_by=EXCLUDED.updated_by,updated_at=now()`,[input.id,version,JSON.stringify(ad),actor.id]);
    await db.query('INSERT INTO portal_advertising_audit(advertisement_id,version,actor_user_id) VALUES($1,$2,$3)',[input.id,version,actor.id]);
    await db.query('COMMIT');return send(200,{advertisement:{id:input.id,version,...ad}});
  }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
};}
