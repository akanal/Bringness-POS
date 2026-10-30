-- Read-only aggregate check. Execute only in an authorized database session.
-- No company IDs, names, or customer numbers are returned.
-- Requires the deployed migration (companies.customer_number) to exist.
-- Both result flags must be true.
SELECT COUNT(*)=COUNT(customer_number) AS all_merchants_numbered,
       COUNT(customer_number)=COUNT(DISTINCT customer_number) AS numbers_unique
FROM companies;
