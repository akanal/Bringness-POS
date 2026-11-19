import {menuPriceSuggestion} from './ai-menu-recommendations.js';
import {menuPosAccess,menuPosSnapshot,publishMenuPos} from './ai-menu-pos.js';
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
ALTER TABLE ai_menu_settings ADD COLUMN IF NOT EXISTS read_sales boolean NOT NULL DEFAULT false;
ALTER TABLE ai_menu_settings ADD COLUMN IF NOT EXISTS read_pos boolean NOT NULL DEFAULT false;
ALTER TABLE ai_menu_settings ADD COLUMN IF NOT EXISTS target_cost_bps int;
ALTER TABLE ai_menu_drafts ADD COLUMN IF NOT EXISTS pos_snapshot jsonb;
ALTER TABLE ai_menu_drafts ADD COLUMN IF NOT EXISTS pos_result jsonb;
`);}
const config=r=>({enabled:r.enabled,readCosts:r.read_costs,readStock:r.read_stock,readSales:r.read_sales,readPos:r.read_pos,targetCostBps:r.target_cost_bps??null,version:r.version});
async function sources(c,user,locationId,s){
 const rows=(await c.query('SELECT id,name,external_code,active FROM ai_recipes WHERE account_id=$1 AND location_id=$2 ORDER BY id LIMIT 501',[user.id,locationId])).rows;
 if(rows.length>500)fail('Zu viele Rezepte für eine Kartenübersicht',409);
 const recipes=[];for(const r of rows){
  const items=(await c.query(`SELECT i.stock_id,i.quantity,s.name,s.unit FROM ai_recipe_items i JOIN ai_stock s ON s.id=i.stock_id WHERE i.recipe_id=$1 AND s.account_id=$2 AND s.location_id=$3 ORDER BY i.stock_id`,[r.id,user.id,locationId])).rows;
  for(const i of items){if(s.read_stock){const row=(await c.query('SELECT quantity,reserved_quantity FROM ai_stock WHERE id=$1 AND account_id=$2 AND location_id=$3',[i.stock_id,user.id,locationId])).rows[0];i.stock_quantity=row.quantity;i.reserved_quantity=row.reserved_quantity;}
   if(s.read_costs){const prices=(await c.query('SELECT unit_cents,received_at FROM ai_confirmed_purchase_prices WHERE stock_id=$1 AND account_id=$2 AND unit=$3 ORDER BY received_at DESC,source_id DESC LIMIT 2',[i.stock_id,user.id,i.unit])).rows;i.unit_cents=prices[0]?.unit_cents??null;i.price_received_at=prices[0]?.received_at??null;i.previous_unit_cents=prices[1]?.unit_cents??null;}}
  recipes.push({...r,items,cost:recipeCost(items),previousCost:recipeCost(items.map(i=>({...i,unit_cents:i.previous_unit_cents})))});
 }
 return recipes;
}
export async function aiMenuRoutes(path,method,b,user,url,{db,sessionHash,posDb}={}){
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
   for(const k of ['readSales','readPos'])if(b[k]!==undefined&&typeof b[k]!=='boolean')fail('Zugriffsschalter prüfen');
   if(b.targetCostBps!==undefined&&b.targetCostBps!==null&&(!Number.isInteger(b.targetCostBps)||b.targetCostBps<100||b.targetCostBps>10000))fail('Ziel-Wareneinsatz zwischen 1 und 100 Prozent prüfen');
   const saved=await c.query('UPDATE ai_menu_settings SET enabled=$2,read_costs=$3,read_stock=$4,read_sales=$6,read_pos=$7,target_cost_bps=$8,version=version+1 WHERE location_id=$1 AND version=$5 RETURNING *',[locationId,b.enabled,b.readCosts,b.readStock,b.version,b.readSales??s.read_sales,b.readPos??s.read_pos,b.targetCostBps===undefined?s.target_cost_bps:b.targetCostBps]);if(!saved.rowCount)fail('Einstellungen geändert. Neu laden.',409);s=saved.rows[0];
   await c.query("INSERT INTO ai_audit(actor_id,target_id,action) VALUES($1,$2,'menu_access_settings')",[user.id,locationId]);await c.query('COMMIT');return {settings:config(s)};
  }
  const card=(await c.query('SELECT * FROM ai_menu_cards WHERE location_id=$1 AND account_id=$2',[locationId,user.id])).rows[0]||null;
  if(path==='/api/ai/menu'&&method==='GET'){
   const recipes=s.enabled?await sources(c,user,locationId,s):[];
   const drafts=(await c.query('SELECT * FROM ai_menu_drafts WHERE location_id=$1 AND account_id=$2 ORDER BY created_at DESC,id LIMIT 50',[locationId,user.id])).rows;
   let posSnapshot=null,posMessage=null;if(s.enabled&&s.read_pos){if(!posDb)fail('POS-Verbindung derzeit nicht verfügbar',503);const p=await posDb.connect();try{await p.query('BEGIN');posSnapshot=await menuPosSnapshot(c,p,user,locationId,recipes);await p.query('COMMIT');}catch(e){await p.query('ROLLBACK');if([403,409].includes(e.status))posMessage=e.message;else throw e}finally{p.release()}}
   await c.query('COMMIT');return {settings:config(s),card,drafts,recipes,posSnapshot,posMessage,posDigest:posSnapshot?menuDigest(posSnapshot):null,prices:s.enabled?recipes.map(r=>menuPriceSuggestion(r,posSnapshot?.products.find(p=>p.id===r.external_code),s.target_cost_bps)):[],suggestions:s.enabled?menuSuggestions(recipes):[],scope:'AI-Kartenfreigabe und zusätzliche ausdrückliche POS-Übernahme sind getrennte Schritte. POS übernimmt Namen, Beschreibung, bestehende Kategorie, Bruttopreis und Sichtbarkeit; keine Reihenfolge, Übersetzungen oder Rezeptänderungen.'};
  }
  if(!s.enabled)fail('Speisekartenassistenz ausgeschaltet',403);
  if(path==='/api/ai/menu/draft'&&method==='POST'){
   const draftId=id(b.id),content=normalizeMenu(b.content);
   const existing=(await c.query('SELECT * FROM ai_menu_drafts WHERE id=$1 AND account_id=$2 AND location_id=$3',[draftId,user.id,locationId])).rows[0];
   if(existing){if(menuDigest(existing.content)!==menuDigest(content)||existing.settings_version!==b.settingsVersion||existing.base_revision!==b.baseRevision)fail('Kennung bereits anders verwendet',409);await c.query('COMMIT');return {draft:existing,replayed:true};}
   if(b.settingsVersion!==s.version||b.baseRevision!==(card?.revision||0))fail('Kartenstand oder Zugriff geändert. Neu laden.',409);
   if(Number((await c.query("SELECT count(*) AS count FROM ai_menu_drafts WHERE account_id=$1 AND location_id=$2 AND state='draft'",[user.id,locationId])).rows[0].count)>=100)fail('Zuerst bestehende Entwürfe entscheiden',409);
   const recipes=await sources(c,user,locationId,s);if(content.items.some(i=>!recipes.some(r=>r.id===i.recipeId)))fail('Rezept gehört nicht zum Standort');
   let snapshot=null;if(s.read_pos){if(!posDb)fail('POS-Verbindung derzeit nicht verfügbar',503);const p=await posDb.connect();try{await p.query('BEGIN');snapshot=await menuPosSnapshot(c,p,user,locationId,recipes);if(b.posDigest!==menuDigest(snapshot))fail('POS-Stand seit Vorschau geändert. Neu laden.',409);await p.query('COMMIT');}catch(e){await p.query('ROLLBACK');throw e}finally{p.release()}}
   const draft=(await c.query('INSERT INTO ai_menu_drafts(id,account_id,location_id,content,source_digest,settings_version,base_revision,pos_snapshot) VALUES($1,$2,$3,$4::jsonb,$5,$6,$7,$8::jsonb) RETURNING *',[draftId,user.id,locationId,JSON.stringify(content),menuDigest(recipes),s.version,b.baseRevision,JSON.stringify(snapshot)])).rows[0];
   await c.query("INSERT INTO ai_audit(actor_id,target_id,action) VALUES($1,$2,'menu_draft_created')",[user.id,draftId]);await c.query('COMMIT');return {draft};
  }
  if(path==='/api/ai/menu/publish'&&method==='POST'){
   if(!s.read_pos||b.confirmed!==true)fail('POS-Zugriff und ausdrückliche Übernahmebestätigung erforderlich',403);
   if(!posDb)fail('POS-Verbindung derzeit nicht verfügbar',503);
   const draft=(await c.query('SELECT * FROM ai_menu_drafts WHERE id=$1 AND account_id=$2 AND location_id=$3 FOR UPDATE',[id(b.id),user.id,locationId])).rows[0];
   if(!draft||draft.state!=='approved'||!draft.pos_snapshot)fail('Zuerst einen POS-gebundenen Entwurf prüfen und freigeben',409);
   const p=await posDb.connect();try{
    await p.query('BEGIN');
    // Check current source authorization even for durable receipt replay.
    await menuPosAccess(c,p,user,locationId);
    const receipt=(await p.query('SELECT result FROM ai_menu_pos_receipts WHERE account_id=$1 AND location_id=$2 AND draft_id=$3',[user.id,locationId,draft.id])).rows[0];
    let result;if(receipt)result={...receipt.result,replayed:true};else{
     if(card?.draft_id!==draft.id||draft.settings_version!==s.version)fail('Kartenstand oder Zugriffe geändert. Neuen Entwurf prüfen.',409);
     const recipes=await sources(c,user,locationId,s);if(draft.source_digest!==menuDigest(recipes))fail('Quelldaten geändert. Neuen Entwurf prüfen.',409);
     result=await publishMenuPos(c,p,user,locationId,draft,recipes);
    }
    await p.query('COMMIT');
    await c.query('UPDATE ai_menu_drafts SET pos_result=$2::jsonb WHERE id=$1',[draft.id,JSON.stringify(result)]);
    await c.query('COMMIT');return {published:result};
   }catch(e){await p.query('ROLLBACK');throw e}finally{p.release()}
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
