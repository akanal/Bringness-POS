import pg from "pg";

await import("./index.js");

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
});

try {
  await pool.query(
    "UPDATE billing_plans SET amount_cents = 39900, currency = 'EUR' WHERE code = 'download_license'"
  );
  console.log("Bringness POS Download price set to 399.00 EUR net.");
} catch (error) {
  console.error("Could not update download license price:", error);
} finally {
  await pool.end();
}
