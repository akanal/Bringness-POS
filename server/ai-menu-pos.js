import {menuDigest} from './ai-menu-core.js';
const fail=(m,status=409)=>{throw Object.assign(Error(m),{status})};
export async function migrateMenuPos(db){await db.query(`CREATE TABLE IF NOT EXISTS ai_menu_pos_receipts(account_id uuid NOT NULL,location_id uuid NOT NULL,draft_id uuid NOT NULL,restaurant_id uuid NOT NULL REFERENCES restaurants(id),digest text NOT NULL,result jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(account_id,location_id,draft_id));`);}
// Called with the AI account/location lock held. Keep connector locks until the
// POS transaction commits; a disconnect cannot race an authorized write.
export async function menuPosAccess(ai,pos,user,locationId){
 const links=(await ai.query("SELECT * FROM ai_connectors WHERE account_id=$1 AND location_id=$2 AND kind='pos' AND active ORDER BY id FOR SHARE",[user.id,locationId])).rows;
 if(links.length!==1)fail('Für die Kartenübernahme genau eine aktive POS-Anbindung auswählen.');
 const link=links[0];
 if(!(await pos.query("SELECT u.id FROM users u JOIN restaurants r ON r.company_id=u.company_id WHERE u.id=$1 AND r.id=$2 AND u.company_id=$3 AND u.status='active' AND u.role IN ('owner','admin') AND NOT COALESCE(u.must_change_password,false) FOR SHARE OF u,r",[link.pos_user_id,link.pos_restaurant_id,link.pos_company_id])).rowCount)fail('Inhaberfreigabe der Kasse nicht mehr gültig',403);
 return link;
}
export async function menuPosSnapshot(ai,pos,user,locationId,recipes){
 const link=await menuPosAccess(ai,pos,user,locationId);
 const codes=recipes.map(r=>r.external_code).filter(v=>/^[0-9a-f-]{36}$/i.test(v));
 const products=(await pos.query(`SELECT p.id,p.restaurant_id,p.category_id,p.name,p.description,p.price_cents,p.tax_rate,p.active,c.name category,c.active category_active FROM products p LEFT JOIN categories c ON c.id=p.category_id AND c.restaurant_id=p.restaurant_id WHERE p.restaurant_id=$1 AND p.id=ANY($2::uuid[]) ORDER BY p.id FOR UPDATE OF p`,[link.pos_restaurant_id,codes])).rows;
 return {connectorId:link.id,restaurantId:link.pos_restaurant_id,companyId:link.pos_company_id,ownerId:link.pos_user_id,products};
}
export async function publishMenuPos(ai,pos,user,locationId,draft,recipes){
 const link=await menuPosAccess(ai,pos,user,locationId),digest=menuDigest({content:draft.content,snapshot:draft.pos_snapshot});
 const old=(await pos.query('SELECT * FROM ai_menu_pos_receipts WHERE account_id=$1 AND location_id=$2 AND draft_id=$3',[user.id,locationId,draft.id])).rows[0];
 if(old){if(old.digest!==digest||old.restaurant_id!==link.pos_restaurant_id)fail('Bereits unter anderem Kartenstand übernommen.');return {...old.result,replayed:true};}
 const current=await menuPosSnapshot(ai,pos,user,locationId,recipes);
 if(!draft.pos_snapshot||menuDigest(current)!==menuDigest(draft.pos_snapshot))fail('POS-Artikel oder Anbindung geändert. Neuen Entwurf prüfen.');
 const ids=new Set();
 for(const item of draft.content.items){
  const recipe=recipes.find(r=>r.id===item.recipeId),product=current.products.find(p=>p.id===recipe?.external_code);
  if(!product||ids.has(product.id))fail('Jedes Gericht benötigt einen eindeutig zugeordneten POS-Artikel.');ids.add(product.id);
  if(item.priceCents===null)fail('Für die POS-Übernahme alle Bruttopreise prüfen.',400);
  const category=(await pos.query('SELECT id FROM categories WHERE restaurant_id=$1 AND name=$2 AND active ORDER BY id FOR SHARE',[link.pos_restaurant_id,item.category])).rows;
  if(category.length!==1)fail('Aktive POS-Kategorie eindeutig auswählen: '+item.category);
  await pos.query('UPDATE products SET name=$3,description=$4,price_cents=$5,active=$6,category_id=$7 WHERE id=$1 AND restaurant_id=$2',[product.id,link.pos_restaurant_id,item.name,item.description,item.priceCents,item.visible,category[0].id]);
 }
 const result={restaurantId:link.pos_restaurant_id,draftId:draft.id,productsUpdated:ids.size};
 await pos.query('INSERT INTO ai_menu_pos_receipts(account_id,location_id,draft_id,restaurant_id,digest,result) VALUES($1,$2,$3,$4,$5,$6::jsonb)',[user.id,locationId,draft.id,link.pos_restaurant_id,digest,JSON.stringify(result)]);
 await pos.query("INSERT INTO audit_log(company_id,actor_user_id,event_type,entity_type,entity_id,payload) VALUES($1,$2,'ai_menu.published','restaurant',$3,$4::jsonb)",[link.pos_company_id,link.pos_user_id,link.pos_restaurant_id,JSON.stringify({draftId:draft.id,productsUpdated:ids.size})]);
 return result;
}
