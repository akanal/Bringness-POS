import {uuid} from './ai-policy.js';

const fail = (message,status=400) => {throw Object.assign(Error(message),{status})};

export async function migratePosAiPrices(db) {
 await db.query(`CREATE TABLE IF NOT EXISTS pos_ai_price_rules (
  restaurant_id uuid PRIMARY KEY REFERENCES restaurants(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  owner_id uuid NOT NULL REFERENCES users(id),
  product_ids uuid[] NOT NULL DEFAULT '{}',
  discount_percent int NOT NULL CHECK(discount_percent BETWEEN 1 AND 50),
  duration_minutes int NOT NULL CHECK(duration_minutes BETWEEN 15 AND 240)
 );
 CREATE TABLE IF NOT EXISTS pos_ai_price_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  product_name text NOT NULL,
  regular_cents int NOT NULL,
  action_cents int NOT NULL,
  sale_day date NOT NULL,
  ends_at timestamptz NOT NULL,
  ended_at timestamptz,
  end_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(product_id,sale_day)
 );
 CREATE INDEX IF NOT EXISTS pos_ai_price_due ON pos_ai_price_actions(ends_at) WHERE ended_at IS NULL;
 CREATE OR REPLACE FUNCTION pos_ai_price_cancel_on_edit() RETURNS trigger LANGUAGE plpgsql AS $$
 BEGIN
  IF NEW.price_cents IS DISTINCT FROM OLD.price_cents AND coalesce(current_setting('bringness.ai_price_write',true),'') <> 'yes' THEN
   UPDATE pos_ai_price_actions SET ended_at=now(),end_reason='manual' WHERE product_id=OLD.id AND ended_at IS NULL;
  END IF;
  RETURN NEW;
 END;
 $$;
 CREATE OR REPLACE TRIGGER pos_ai_price_cancel_on_edit AFTER UPDATE OF price_cents ON products
 FOR EACH ROW EXECUTE FUNCTION pos_ai_price_cancel_on_edit();`);
}

async function tx(pool,run) {
 const db=await pool.connect();
 try {await db.query('BEGIN');const result=await run(db);await db.query('COMMIT');return result}
 catch(error){await db.query('ROLLBACK');throw error}
 finally{db.release()}
}

async function managedPrice(db,productId,price) {
 await db.query("SELECT set_config('bringness.ai_price_write','yes',true)");
 await db.query('UPDATE products SET price_cents=$2 WHERE id=$1',[productId,price]);
 await db.query("SELECT set_config('bringness.ai_price_write','no',true)");
}

async function endAction(db,action,reason) {
 await db.query('SELECT id FROM products WHERE id=$1 FOR UPDATE',[action.product_id]);
 const current=(await db.query(`UPDATE pos_ai_price_actions SET ended_at=now(),end_reason=$2
  WHERE id=$1 AND ended_at IS NULL RETURNING product_id,regular_cents`,[action.id,reason])).rows[0];
 if(!current)return false;
 await managedPrice(db,current.product_id,current.regular_cents);
 return true;
}

export async function expirePosAiPrices(pool) {
 return tx(pool,async db=>{
  const due=(await db.query(`SELECT a.id,a.product_id FROM pos_ai_price_actions a JOIN products p ON p.id=a.product_id
   WHERE a.ended_at IS NULL AND a.ends_at<=now() ORDER BY a.ends_at LIMIT 100 FOR UPDATE OF p SKIP LOCKED`)).rows;
  for(const action of due)await endAction(db,action,'expired');
  return due.length;
 });
}

export async function applyPosAiPrice(db,link,productId,saleDay) {
 if(!(await db.query("SELECT 1 WHERE (now() AT TIME ZONE 'Europe/Berlin')::date=$1::date",[saleDay])).rowCount)return false;
 const rule=(await db.query(`SELECT r.* FROM pos_ai_price_rules r JOIN users u ON u.id=r.owner_id
  WHERE r.restaurant_id=$1 AND r.enabled AND $2=ANY(r.product_ids) AND u.company_id=$3 AND u.role IN ('owner','admin')
  AND u.status='active' AND NOT coalesce(u.must_change_password,false) FOR UPDATE OF r FOR SHARE OF u`,
  [link.pos_restaurant_id,productId,link.pos_company_id])).rows[0];
 if(!rule)return false;
 const product=(await db.query('SELECT id,name,price_cents FROM products WHERE id=$1 AND restaurant_id=$2 AND active AND ai_stock_available FOR UPDATE',[productId,link.pos_restaurant_id])).rows[0];
 if(!product)return false;
 if((await db.query('SELECT 1 FROM pos_ai_price_actions WHERE product_id=$1 AND ended_at IS NULL',[productId])).rowCount)return false;
 const actionCents=Math.ceil(product.price_cents*(100-rule.discount_percent)/100);
 if(actionCents<1||actionCents>=product.price_cents)return false;
 const inserted=await db.query(`INSERT INTO pos_ai_price_actions(restaurant_id,product_id,product_name,regular_cents,action_cents,sale_day,ends_at)
  VALUES($1,$2,$3,$4,$5,(now() AT TIME ZONE 'Europe/Berlin')::date,
  least(now()+make_interval(mins=>$6),(((now() AT TIME ZONE 'Europe/Berlin')::date+1)::timestamp AT TIME ZONE 'Europe/Berlin')))
  ON CONFLICT(product_id,sale_day) DO NOTHING RETURNING id`,
  [link.pos_restaurant_id,product.id,product.name,product.price_cents,actionCents,rule.duration_minutes]);
 if(!inserted.rowCount)return false;
 await managedPrice(db,product.id,actionCents);
 return true;
}

export async function posAiPrices(pool,user,restaurantId,method,body) {
 if(user.must_change_password)fail('Nur für die Betriebsverwaltung.',403);
 if(!uuid.test(restaurantId||''))fail('Betrieb auswählen.');
 return tx(pool,async db=>{
  const owner=(await db.query(`SELECT u.id,u.role FROM users u JOIN restaurants r ON r.company_id=u.company_id
   WHERE u.id=$1 AND r.id=$2 AND u.status='active' AND NOT coalesce(u.must_change_password,false) FOR SHARE OF u,r`,
   [user.id,restaurantId])).rows[0];
  if(!owner)fail('Betrieb nicht gefunden.',404);
  const canManage=['owner','admin'].includes(owner.role);
  if(method!=='GET'&&!canManage)fail('Nur für die Betriebsverwaltung.',403);
  if(method==='GET'){
   const rule=(await db.query('SELECT enabled,product_ids,discount_percent,duration_minutes FROM pos_ai_price_rules WHERE restaurant_id=$1',[restaurantId])).rows[0];
   const actions=(await db.query('SELECT id,product_name,regular_cents,action_cents,ends_at FROM pos_ai_price_actions WHERE restaurant_id=$1 AND ended_at IS NULL AND ends_at>now() ORDER BY created_at DESC',[restaurantId])).rows;
   const prices=(await db.query('SELECT p.id,p.price_cents FROM products p WHERE p.restaurant_id=$1 AND EXISTS(SELECT 1 FROM pos_ai_price_actions a WHERE a.product_id=p.id)',[restaurantId])).rows;
   return {canManage,rule:canManage?(rule||{enabled:false,product_ids:[],discount_percent:10,duration_minutes:60}):null,actions,prices};
  }
  if(method!=='POST')fail('Methode nicht erlaubt.',405);
  if(body.action==='undo'){
   if(!uuid.test(body.id||''))fail('Aktion auswählen.');
   const action=(await db.query('SELECT id,product_id FROM pos_ai_price_actions WHERE id=$1 AND restaurant_id=$2',[body.id,restaurantId])).rows[0];
   if(!action)fail('Aktion nicht gefunden.',404);
   return {ok:true,changed:await endAction(db,action,'undo')};
  }
  if(body.action==='disable'){
   await db.query('UPDATE pos_ai_price_rules SET enabled=false WHERE restaurant_id=$1',[restaurantId]);
   const actions=(await db.query('SELECT id,product_id FROM pos_ai_price_actions WHERE restaurant_id=$1 AND ended_at IS NULL ORDER BY product_id',[restaurantId])).rows;
   for(const action of actions)await endAction(db,action,'disabled');
   return {ok:true};
  }
  const {productIds,discountPercent,durationMinutes}=body;
  if(body.action!=='enable'||body.confirmed!==true||!Array.isArray(productIds)||!productIds.length||productIds.length>100||
     productIds.some(id=>!uuid.test(id||''))||new Set(productIds).size!==productIds.length||
     !Number.isInteger(discountPercent)||discountPercent<1||discountPercent>50||
     !Number.isInteger(durationMinutes)||durationMinutes<15||durationMinutes>240)fail('Artikel, Rabatt, Laufzeit und Freigabe prüfen.');
  const products=await db.query('SELECT id FROM products WHERE restaurant_id=$1 AND active AND id=ANY($2::uuid[])',[restaurantId,productIds]);
  if(products.rowCount!==productIds.length)fail('Alle Artikel müssen zu diesem Betrieb gehören.');
  const saved=await db.query(`INSERT INTO pos_ai_price_rules(restaurant_id,enabled,owner_id,product_ids,discount_percent,duration_minutes)
   VALUES($1,true,$2,$3,$4,$5) ON CONFLICT(restaurant_id) DO UPDATE SET enabled=true,owner_id=EXCLUDED.owner_id,
   product_ids=EXCLUDED.product_ids,discount_percent=EXCLUDED.discount_percent,duration_minutes=EXCLUDED.duration_minutes
   WHERE NOT pos_ai_price_rules.enabled RETURNING restaurant_id`,
   [restaurantId,user.id,productIds,discountPercent,durationMinutes]);
  if(!saved.rowCount)fail('Bitte die laufende Freigabe vor dem Ändern der Regeln ausschalten.',409);
  return {ok:true};
 });
}
