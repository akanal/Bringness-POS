-- Read-only aggregate check. Do not output company IDs, names or customer numbers.
-- Run only in the authorized production database session, after deployment.
-- Expected result: customer_number_column_present=true, all_merchants_numbered=true,
-- numbers_unique=true. No data changes are made.
WITH col AS (
 SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='companies' AND column_name='customer_number') AS present
), audit AS (
 SELECT COUNT(*) AS total, COUNT(customer_number) AS numbered,
        COUNT(DISTINCT customer_number) AS distinct_numbers
 FROM companies
)
SELECT col.present AS customer_number_column_present,
       audit.total=audit.numbered AS all_merchants_numbered,
       audit.numbered=audit.distinct_numbers AS numbers_unique
FROM col CROSS JOIN audit;
