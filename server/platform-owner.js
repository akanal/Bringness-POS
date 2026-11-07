// A platform grant is global authority, never a tenant or licence role.
// Persist the identity once; email/name and later bootstrap attempts cannot transfer it.
export async function migratePlatformOwner(pool){
 const db=await pool.connect();
 try{
  await db.query('BEGIN');
  await db.query('LOCK TABLE platform_admins IN ACCESS EXCLUSIVE MODE');
  await db.query(`CREATE TABLE IF NOT EXISTS platform_owner(
   singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
   user_id uuid UNIQUE NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
   bound_at timestamptz NOT NULL DEFAULT now()
  )`);
  const bound=(await db.query('SELECT user_id FROM platform_owner')).rows[0];
  const grants=(await db.query('SELECT user_id FROM platform_admins WHERE active=true')).rows;
  if(!bound && grants.length>1)throw new Error('PLATFORM_OWNER_AMBIGUOUS: protected owner confirmation required; no grants changed');
  if(bound && grants.some(g=>g.user_id!==bound.user_id))throw new Error('PLATFORM_OWNER_CONFLICT: no grants changed');
  if(!bound && grants.length===1){
   // Only the already explicitly authorised, unique platform identity may migrate.
   await db.query('INSERT INTO platform_owner(user_id) VALUES($1)',[grants[0].user_id]);
  }
  await db.query(`
   CREATE OR REPLACE FUNCTION protect_platform_owner_identity() RETURNS trigger LANGUAGE plpgsql AS $$
   BEGIN RAISE EXCEPTION 'Platform owner identity requires protected operational recovery' USING ERRCODE='42501'; END $$;
   DROP TRIGGER IF EXISTS platform_owner_identity_locked ON platform_owner;
   CREATE TRIGGER platform_owner_identity_locked BEFORE UPDATE OR DELETE OR TRUNCATE ON platform_owner
    FOR EACH STATEMENT EXECUTE FUNCTION protect_platform_owner_identity();
   CREATE OR REPLACE FUNCTION protect_platform_owner_grant() RETURNS trigger LANGUAGE plpgsql AS $$
   DECLARE owner_id uuid;
   BEGIN
    IF NOT NEW.active THEN RETURN NEW; END IF;
    -- A transaction-level lock also serialises two first-time bootstrap requests.
    PERFORM pg_advisory_xact_lock(727140221);
    SELECT user_id INTO owner_id FROM platform_owner WHERE singleton=true;
    IF owner_id IS NULL THEN
     INSERT INTO platform_owner(user_id) VALUES(NEW.user_id);
     owner_id := NEW.user_id;
    END IF;
    IF NEW.user_id <> owner_id THEN
     RAISE EXCEPTION 'Only the bound platform owner may hold a platform grant' USING ERRCODE='42501';
    END IF;
    RETURN NEW;
   END $$;
   DROP TRIGGER IF EXISTS platform_owner_grant_locked ON platform_admins;
   CREATE TRIGGER platform_owner_grant_locked BEFORE INSERT OR UPDATE ON platform_admins
    FOR EACH ROW EXECUTE FUNCTION protect_platform_owner_grant();
   CREATE UNIQUE INDEX IF NOT EXISTS platform_one_active_owner ON platform_admins((active)) WHERE active=true;
  `);
  await db.query('COMMIT');
 }catch(error){await db.query('ROLLBACK');throw error}finally{db.release()}
}

// Called only after existing session and bootstrap-secret authentication.
// Binding survives suspension/revocation; an old setup code can never appoint a successor.
export async function bootstrapPlatformOwner(pool,user){
 const db=await pool.connect();
 try{
  await db.query('BEGIN');
  await db.query('LOCK TABLE platform_admins IN ACCESS EXCLUSIVE MODE');
  const binding=(await db.query('SELECT user_id FROM platform_owner')).rows[0];
  if(binding){await db.query('ROLLBACK');return false}
  const active=(await db.query("SELECT id FROM users WHERE id=$1 AND status='active' AND NOT coalesce(must_change_password,false) FOR SHARE",[user.id])).rows[0];
  if(!active){await db.query('ROLLBACK');return false}
  await db.query('INSERT INTO platform_admins(user_id) VALUES($1)',[user.id]);
  await db.query("INSERT INTO audit_log(company_id,actor_user_id,event_type,entity_type,entity_id) VALUES($1,$2,'platform.owner.bound','user',$3)",[user.company_id,user.id,user.id]);
  await db.query('COMMIT');return true;
 }catch(error){await db.query('ROLLBACK');throw error}finally{db.release()}
}
