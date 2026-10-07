import pg from "pg";
import {createPublicReceiptHandler} from "./public-receipt-core.js";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false });
export async function migratePublicReceipts() {
  await pool.query(`ALTER TABLE receipts ADD COLUMN IF NOT EXISTS public_token uuid;
    UPDATE receipts SET public_token=gen_random_uuid() WHERE public_token IS NULL;
    ALTER TABLE receipts ALTER COLUMN public_token SET DEFAULT gen_random_uuid();
    CREATE UNIQUE INDEX IF NOT EXISTS receipts_public_token_idx ON receipts(public_token);`);
}

export function receiptUrl(req, token) {
  const host = String(req.headers.host || "");
  if (!/^[a-z0-9.-]+(?::\d{1,5})?$/i.test(host) || !/^[0-9a-f-]{36}$/i.test(String(token))) throw new Error("Ungültiger Beleglink");
  if (process.env.APP_MODE === "pos" && process.env.NODE_ENV === "production" && process.env.PUBLIC_BASE_URL) {
    const origin = new URL(process.env.PUBLIC_BASE_URL);
    if (origin.protocol !== "https:" || origin.username || origin.password) throw new Error("Ungültige öffentliche Adresse");
    return `${origin.origin}/beleg/${token}`;
  }
  return `${process.env.NODE_ENV === "production" ? "https" : "http"}://${host}/beleg/${token}`;
}

export const handlePublicReceipt=createPublicReceiptHandler(pool);
