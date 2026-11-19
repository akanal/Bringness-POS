import {uuid} from './ai-policy.js';
import {lockAiRestaurant} from './ai-write-authorization.js';
import {recipeCost} from './ai-recipe-cost-core.js';
import {normalizeMenu,menuDigest,menuSuggestions} from './ai-menu-core.js';
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status})};
const id=v=>{if(!uuid.test(String(v)))fail('Gültige Kennung erforderlich');return v};
export async function migrateAiMenu(db){await db.query(`
CREATE TABLE IF NOT EXISTS ai_menu_settings(location_id uuid PRIMARY KEY REFERENCES ai_locations(id),enabled boolean NOT NULL DEFAULT false,read_costs boolean NOT NULL DEFAULT false,read_stock boolean NOT NULL DEFAULT false,version int NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS ai_menu_drafts(id uuid PRIMARY KEY,account_id uuid NOT NULL REFERENCES ai_accounts(id),location_id uuid NOT NULL REFERENCES ai_locations(id),content jsonb NOT NULL,source_digest text NOT NULL,settings_version int NOT NULL,base_revision int NOT NULL,state text NOT NULL DEFAULT 'draft' CHECK(state IN ('draft','approved','rejected')),version int NOT NULL DEFAULT 1,created_at timestamptz NOT NULL DEFAULT now(),decided_at timestamptz);
CREATE INDEX IF NOT EXISTS ai_menu_drafts_owner ON ai_menu_drafts(account_id,location_id,created_at DESC);
CREATE TABLE IF NOT EXISTS ai_menu_cards(location_id uuid PRIMARY KEY REFERENCES ai_locations(id),account_id uuid NOT NULL REFERENCES ai_accounts(id),content jsonb NOT NULL,revision int NOT NULL,draft_id uuid NOT NULL REFERENCES ai_menu_drafts(id),approved_at timestamptz NOT NULL DEFAULT now());
`);}
const config=r=>({enabled:r.enabled,readCosts:r.read_costs,readStock:r.read_stock,version:r.version});
async function sources(c,user,locationId,s){
 const rows=(await c.query('SELECT id,name,external_code,active FROM ai_recipes WHERE account_id=$1 AND location_id=$2 ORDER BY id LIMIT 501',[user.id,locationId])).rows;
 if(rows.length>500)fail('Zu viele Rezepte für eine Kartenübersicht',409);
 const recipes=[];for(const r of rows){
  const items=(await c.query(`SELECT i.stock_id,i.quantity,s.name,s.unit FROM ai_recipe_items i JOIN ai_stock s ON s.id=i.stock_id WHERE i.recipe_id=$1 AND s.account_id=$2 AND s.location_id=$3 ORDER BY i.stock_id`,[r.id,user.id,locationId])).rows;
  for(const i of items){if(s.read_stock){const row=(await c.query('SELECT quantity,reserved_quantity FROM ai_stock WHERE id=$1 AND account_id=$2 AND location_id=$3',[i.stock_id,user.id,locationId])).rows[0];i.stock_quantity=row.quantity;i.reserved_quantity=row.reserved_quantity;}
   if(s.read_costs){const price=(await c.query('SELECT unit_cents,received_at FROM ai_confirmed_purchase_prices WHERE stock_id=$1 AND account_id=$2 AND unit=$3 ORDER BY received_at DESC,source_id DESC LIMIT 1',[i.stock_id,user.id,i.unit])).rows[0];i.unit_cents=price?.unit_cents??null;i.price_received_at=price?.received_at??null;}}
  recipes.push({...r,items,cost:recipeCost(items)});
 }
 return recipes;
}
export async function aiMenuRoutes(path,method,b,user,url,{db,sessionHash}={}){
 if(user.role!=='restaurant')fail('Nur für Restaurantbetreiber',403);
 const locationId=id(method==='GET'?url.searchParams.get('locationId'):b.locationId);
 const c=await db.connect();try{
  await c.query('BEGIN');await lockAiRestaurant(c,user.id);
  if(sessionHash&&!(await c.query('SELECT token_hash FROM ai_sessions WHERE token_hash=$1 AND account_id=$2 AND expires_at>now() FOR SHARE',[sessionHash,user.id])).rowCount)fail('Sitzung abgelaufen',401);
  if(!(await c.query('SELECT id FROM ai_locations WHERE id=$1 AND account_id=$2 FOR UPDATE',[locationId,user.id])).rowCount)fail('Standort nicht gefunden',404);
  await c.query('INSERT INTO ai_menu_settings(location_id) VALUES($1) ON CONFLICT DO NOTHING',[locationId]);
  let s=(await c.query('SELECT * FROM ai_menu_settings WHERE location_id=$1 FOR UPDATE',[locationId])).rows[0];
  if(path==='/api/ai/menu/settings'&&method==='POST'){
   if(!['enabled','readCosts','readStock'].every(k=>typeof b[k]==='boolean')||!Number.isSafeInteger(b.version))fail('Schalter und aktuelle Version erforderlich');
   const saved=await c.query('UPDATE ai_menu_settings SET enabled=$2,read_costs=$3,read_stock=$4,version=version+1 WHERE location_id=$1 AND version=$5 RETURNING *',[locationId,b.enabled,b.readCosts,b.readStock,b.version]);if(!saved.rowCount)fail('Einstellungen geändert. Neu laden.',409);s=saved.rows[0];
   await c.query("INSERT INTO ai_audit(actor_id,target_id,action) VALUES($1,$2,'menu_access_settings')",[user.id,locationId]);await c.query('COMMIT');return {settings:config(s)};
  }
  const card=(await c.query('SELECT * FROM ai_menu_cards WHERE location_id=$1 AND account_id=$2',[locationId,user.id])).rows[0]||null;
  if(path==='/api/ai/menu'&&method==='GET'){
   const recipes=s.enabled?await sources(c,user,locationId,s):[];
   const drafts=(await c.query('SELECT * FROM ai_menu_drafts WHERE location_id=$1 AND account_id=$2 ORDER BY created_at DESC,id LIMIT 50',[locationId,user.id])).rows;
   await c.query('COMMIT');return {settings:config(s),card,drafts,recipes,suggestions:s.enabled?menuSuggestions(recipes):[],scope:'Freigegebene AI-Kartenfassung; keine automatische Änderung der POS-Artikel, Rezepturen oder Bestellungen.'};
  }
  if(!s.enabled)fail('Speisekartenassistenz ausgeschaltet',403);
  if(path==='/api/ai/menu/draft'&&method==='POST'){
   const draftId=id(b.id),content=normalizeMenu(b.content);
   const existing=(await c.query('SELECT * FROM ai_menu_drafts WHERE id=$1 AND account_id=$2 AND location_id=$3',[draftId,user.id,locationId])).rows[0];
   if(existing){if(menuDigest(existing.content)!==menuDigest(content)||existing.settings_version!==b.settingsVersion||existing.base_revision!==b.baseRevision)fail('Kennung bereits anders verwendet',409);await c.query('COMMIT');return {draft:existing,replayed:true};}
   if(b.settingsVersion!==s.version||b.baseRevision!==(card?.revision||0))fail('Kartenstand oder Zugriff geändert. Neu laden.',409);
   if(Number((await c.query("SELECT count(*) AS count FROM ai_menu_drafts WHERE account_id=$1 AND location_id=$2 AND state='draft'",[user.id,locationId])).rows[0].count)>=100)fail('Zuerst bestehende Entwürfe entscheiden',409);
   const recipes=await sources(c,user,locationId,s);if(content.items.some(i=>!recipes.some(r=>r.id===i.recipeId)))fail('Rezept gehört nicht zum Standort');
   const draft=(await c.query('INSERT INTO ai_menu_drafts(id,account_id,location_id,content,source_digest,settings_version,base_revision) VALUES($1,$2,$3,$4::jsonb,$5,$6,$7) RETURNING *',[draftId,user.id,locationId,JSON.stringify(content),menuDigest(recipes),s.version,b.baseRevision])).rows[0];
   await c.query("INSERT INTO ai_audit(actor_id,target_id,action) VALUES($1,$2,'menu_draft_created')",[user.id,draftId]);await c.query('COMMIT');return {draft};
  }
  if(path==='/api/ai/menu/decide'&&method==='POST'){
   if(!['approve','reject'].includes(b.decision)||b.confirmed!==true)fail('Ausdrückliche Entscheidung erforderlich');
   const draft=(await c.query('SELECT * FROM ai_menu_drafts WHERE id=$1 AND account_id=$2 AND location_id=$3 FOR UPDATE',[id(b.id),user.id,locationId])).rows[0];if(!draft)fail('Entwurf nicht gefunden',404);
   const state=b.decision==='approve'?'approved':'rejected';
   if(draft.state===state){await c.query('COMMIT');return {state,replayed:true};}
   if(draft.state!=='draft'||b.version!==draft.version)fail('Entwurf bereits entschieden oder geändert',409);
   if(state==='approved'){
    if(draft.settings_version!==s.version||draft.base_revision!==(card?.revision||0)||draft.source_digest!==menuDigest(await sources(c,user,locationId,s)))fail('Daten, Freigaben oder Karte geändert. Neuen Entwurf prüfen.',409);
    if(draft.content.items.some(i=>i.visible&&i.priceCents===null))fail('Bruttopreise aller sichtbaren Gerichte prüfen');
    await c.query('INSERT INTO ai_menu_cards(location_id,account_id,content,revision,draft_id) VALUES($1,$2,$3::jsonb,$4,$5) ON CONFLICT(location_id) DO UPDATE SET content=EXCLUDED.content,revision=EXCLUDED.revision,draft_id=EXCLUDED.draft_id,approved_at=now()',[locationId,user.id,JSON.stringify(draft.content),(card?.revision||0)+1,draft.id]);
   }
   await c.query('UPDATE ai_menu_drafts SET state=$2,version=version+1,decided_at=now() WHERE id=$1',[draft.id,state]);await c.query('INSERT INTO ai_audit(actor_id,target_id,action) VALUES($1,$2,$3)',[user.id,draft.id,'menu_'+state]);await c.query('COMMIT');return {state};
  }
  fail('Funktion oder Methode nicht gefunden',404);
 }catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}
}
