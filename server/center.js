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
  `);
}
