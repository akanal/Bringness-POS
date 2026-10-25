// A recorded TEST purchase or an older active row must never grant downloads.
export async function readWindowsEntitlement(db,companyId){
 const row=(await db.query(`SELECT ce.id,ce.purchased_at,ce.provider_reference,ce.provider,ce.status,ce.current_period_end,bp.code,
   (ce.current_period_end IS NULL OR ce.current_period_end>clock_timestamp()) AS within_period
   FROM company_entitlements ce JOIN billing_plans bp ON bp.id=ce.plan_id
   WHERE ce.company_id=$1 AND bp.code='download_license'
   ORDER BY ce.created_at DESC NULLS LAST,ce.id DESC LIMIT 1`,[companyId])).rows[0];
 if(!row||row.status!=='active'||typeof row.provider!=='string'||!row.provider.trim()||row.provider.trim().toLowerCase()==='test'||row.within_period!==true)return null;
 return row;
}
