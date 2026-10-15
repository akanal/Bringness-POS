// Read-only subscription state for the isolated sandbox.
// The caller must authenticate the company and supply its trusted companyId.
import {sandboxMonthlyAccess} from "./pos-license-recurring-access.js";

export async function getSandboxMonthlyEntitlements(pool,{companyId,at=new Date()}){
 if(typeof companyId!=="string" || !companyId.trim())
  return {ok:false,reason:"company_required"};
 const result=await pool.query(
  "SELECT plan_code,status,paid_through FROM sandbox_pos_monthly_subscriptions WHERE company_id=$1 ORDER BY plan_code",
  [companyId]
 );
 return {ok:true,companyId,plans:result.rows.map(row=>({
  planCode:row.plan_code,status:row.status,
  ...sandboxMonthlyAccess(row,at)
 }))};
}
