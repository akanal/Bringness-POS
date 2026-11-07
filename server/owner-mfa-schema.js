export async function migrateOwnerMfa(pool){await pool.query(`
CREATE TABLE IF NOT EXISTS platform_owner_mfa(
 user_id uuid PRIMARY KEY REFERENCES platform_owner(user_id) ON DELETE RESTRICT,
 enabled boolean NOT NULL DEFAULT false,secret_cipher text,pending_cipher text,pending_id text,pending_session text,pending_until timestamptz,
 recovery_hashes text[] NOT NULL DEFAULT '{}',pending_recovery_hashes text[] NOT NULL DEFAULT '{}',
 last_step bigint NOT NULL DEFAULT -1,revision bigint NOT NULL DEFAULT 0,failed_count int NOT NULL DEFAULT 0,failure_window timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS platform_mfa_challenges(
 token_hash text PRIMARY KEY,user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 password_fingerprint text NOT NULL,revision bigint NOT NULL,expires_at timestamptz NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),attempts int NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS platform_mfa_challenge_user ON platform_mfa_challenges(user_id);
CREATE TABLE IF NOT EXISTS platform_mfa_verified(
 token_hash text PRIMARY KEY,user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 expires_at timestamptz NOT NULL,verified_at timestamptz NOT NULL DEFAULT now(),method text NOT NULL CHECK(method IN ('totp','recovery'))
);
CREATE OR REPLACE FUNCTION enforce_platform_mfa_session() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 -- Serialize even legacy/raw session inserts against activation/password changes.
 PERFORM 1 FROM users u JOIN platform_owner o ON o.user_id=u.id WHERE u.id=NEW.user_id FOR SHARE OF u;
 IF EXISTS(SELECT 1 FROM platform_owner_mfa WHERE user_id=NEW.user_id AND enabled=true) AND NOT EXISTS(
  SELECT 1 FROM platform_mfa_verified WHERE user_id=NEW.user_id AND token_hash=NEW.token_hash AND expires_at>=NEW.expires_at AND expires_at>clock_timestamp()
 ) THEN RAISE EXCEPTION 'Owner second factor required before session issuance' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS platform_mfa_session_guard ON sessions;
CREATE TRIGGER platform_mfa_session_guard BEFORE INSERT OR UPDATE ON sessions FOR EACH ROW EXECUTE FUNCTION enforce_platform_mfa_session();
CREATE OR REPLACE FUNCTION cleanup_platform_mfa_session() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN DELETE FROM platform_mfa_verified WHERE token_hash=OLD.token_hash; RETURN OLD; END $$;
DROP TRIGGER IF EXISTS platform_mfa_session_cleanup ON sessions;
CREATE TRIGGER platform_mfa_session_cleanup AFTER DELETE ON sessions FOR EACH ROW EXECUTE FUNCTION cleanup_platform_mfa_session();
`)}
