// POS merchant customer numbers are separate from fiscal invoice numbers.
// The application startup calls this only after the core company schema exists.
export async function migrateMerchantCustomerNumbers(pool){
 await pool.query(`CREATE SEQUENCE IF NOT EXISTS bringness_customer_number_seq START WITH 100001;
 ALTER TABLE companies ADD COLUMN IF NOT EXISTS customer_number bigint;
 ALTER TABLE companies ALTER COLUMN customer_number SET DEFAULT nextval('bringness_customer_number_seq');
 UPDATE companies SET customer_number=nextval('bringness_customer_number_seq') WHERE customer_number IS NULL;
 CREATE UNIQUE INDEX IF NOT EXISTS companies_customer_number_unique ON companies(customer_number);`);
}
