import {renderSandboxInvoiceHtml} from "./pos-license-recurring-invoice-html.js";
export async function findSandboxInvoiceForCompany(pool,companyId,invoiceNumber){
 const result=await pool.query("SELECT issued_details FROM sandbox_pos_monthly_invoice_drafts WHERE company_id=$1 AND invoice_number=$2 AND status='issued' AND issued_details IS NOT NULL",[companyId,invoiceNumber]);
 if(result.rowCount!==1)return null;
 return renderSandboxInvoiceHtml(result.rows[0].issued_details);
}
