import pg from 'pg';
import {createCenterHandler} from './center-core.js';
const pool = new pg.Pool({connectionString: process.env.DATABASE_URL, ssl: process.env.NODE_ENV === 'production' ? {rejectUnauthorized: false} : false});
export const handleCenter = createCenterHandler(pool);
export async function migrateCenter() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS centers (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id uuid NOT NULL REFERENCES companies(id),
      name text NOT NULL, active boolean NOT NULL DEFAULT true
    );
    CREATE TABLE IF NOT EXISTS center_tables (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      center_id uuid NOT NULL REFERENCES centers(id),
      name text NOT NULL, qr_token text UNIQUE NOT NULL,
      active boolean NOT NULL DEFAULT true
    );
    CREATE TABLE IF NOT EXISTS center_restaurants (
      center_id uuid NOT NULL REFERENCES centers(id),
      restaurant_id uuid NOT NULL REFERENCES restaurants(id),
      active boolean NOT NULL DEFAULT true,
      PRIMARY KEY(center_id,restaurant_id)
    );
    CREATE INDEX IF NOT EXISTS centers_company_idx ON centers(company_id);
    CREATE INDEX IF NOT EXISTS center_tables_center_idx ON center_tables(center_id);
    CREATE UNIQUE INDEX IF NOT EXISTS center_restaurants_one_center_idx ON center_restaurants(restaurant_id);
    ALTER TABLE center_restaurants ADD COLUMN IF NOT EXISTS contract_status text NOT NULL DEFAULT 'pending' CHECK(contract_status IN ('pending','signed','suspended'));
    ALTER TABLE center_restaurants ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'not_connected' CHECK(payment_status IN ('not_connected','pending','verified','blocked'));
    ALTER TABLE center_restaurants ADD COLUMN IF NOT EXISTS merchant_reference text;
    ALTER TABLE center_restaurants ADD COLUMN IF NOT EXISTS enrolled_at timestamptz NOT NULL DEFAULT now();
    ALTER TABLE centers ADD COLUMN IF NOT EXISTS setup_user_id uuid REFERENCES users(id);
    ALTER TABLE centers ADD COLUMN IF NOT EXISTS setup_approved_by uuid REFERENCES users(id);
    ALTER TABLE centers ADD COLUMN IF NOT EXISTS setup_approved_at timestamptz;
    ALTER TABLE centers ADD COLUMN IF NOT EXISTS setup_completed_at timestamptz;
    CREATE TABLE IF NOT EXISTS center_mollie_oauth_states (
      state_hash text PRIMARY KEY,user_id uuid NOT NULL REFERENCES users(id),
      center_id uuid NOT NULL,restaurant_id uuid NOT NULL,expires_at timestamptz NOT NULL,
      FOREIGN KEY(center_id,restaurant_id) REFERENCES center_restaurants(center_id,restaurant_id)
    );
    ALTER TABLE center_mollie_oauth_states ADD COLUMN IF NOT EXISTS browser_hash text;
    CREATE TABLE IF NOT EXISTS center_mollie_credentials (
      restaurant_id uuid PRIMARY KEY REFERENCES restaurants(id),token_envelope text NOT NULL,
      expires_at timestamptz NOT NULL,updated_at timestamptz NOT NULL DEFAULT now()
    );
    ALTER TABLE center_mollie_credentials ADD COLUMN IF NOT EXISTS profile_id text;
    ALTER TABLE center_mollie_credentials ADD COLUMN IF NOT EXISTS organization_id text;
    ALTER TABLE center_mollie_credentials ADD COLUMN IF NOT EXISTS verified_at timestamptz;
    CREATE TABLE IF NOT EXISTS center_checkout_attempts (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),order_id uuid UNIQUE NOT NULL REFERENCES orders(id),
      center_id uuid NOT NULL,restaurant_id uuid NOT NULL,
      guest_status_token text UNIQUE NOT NULL DEFAULT replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-',''),
      attempted_at timestamptz,request_payload jsonb,payment_id text UNIQUE,checkout_url text,
      FOREIGN KEY(center_id,restaurant_id) REFERENCES center_restaurants(center_id,restaurant_id)
    );
    ALTER TABLE center_checkout_attempts ADD COLUMN IF NOT EXISTS table_id uuid REFERENCES center_tables(id);
    ALTER TABLE center_checkout_attempts ADD COLUMN IF NOT EXISTS request_id uuid;
    ALTER TABLE center_checkout_attempts ADD COLUMN IF NOT EXISTS cart_hash text;
    CREATE UNIQUE INDEX IF NOT EXISTS center_checkout_request_idx ON center_checkout_attempts(table_id,request_id);
    CREATE TABLE IF NOT EXISTS center_order_payments (
      payment_id text PRIMARY KEY,
      order_id uuid UNIQUE NOT NULL REFERENCES orders(id),
      center_id uuid NOT NULL,
      restaurant_id uuid NOT NULL,
      merchant_reference text NOT NULL,
      amount_cents integer NOT NULL CHECK(amount_cents>0),
      currency text NOT NULL CHECK(currency='EUR'),
      paid_at timestamptz,
      released_at timestamptz,
      preparation_started_at timestamptz,
      ready_at timestamptz,
      guest_status_token text UNIQUE NOT NULL DEFAULT replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-',''),
      FOREIGN KEY(center_id,restaurant_id) REFERENCES center_restaurants(center_id,restaurant_id)
    );
    ALTER TABLE center_order_payments ADD COLUMN IF NOT EXISTS preparation_started_at timestamptz;
    ALTER TABLE center_order_payments ADD COLUMN IF NOT EXISTS ready_at timestamptz;
    ALTER TABLE center_order_payments ADD COLUMN IF NOT EXISTS guest_status_token text UNIQUE NOT NULL DEFAULT replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-','');
  `);
}
