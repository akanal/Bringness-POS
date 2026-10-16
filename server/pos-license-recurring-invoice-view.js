import {renderSandboxInvoicePrintHtml} from "./pos-license-recurring-invoice-print.js";
import {exportSandboxInvoiceJson} from "./pos-license-recurring-invoice-json.js";
import {renderSandboxInvoiceHtml} from "./pos-license-recurring-invoice-html.js";
export async function findSandboxInvoiceForCompany(pool,companyId,invoiceNumber){
 if(!companyId||!invoiceNumber)return null;
 const result=await pool.query("SELECT issued_details FROM sandbox_pos_monthly_invoice_drafts WHERE company_id=$1 AND invoice_number=$2 AND status='issued' AND issued_details IS NOT NULL",[companyId,invoiceNumber]);
 if(result.rowCount!==1)return null;
 return renderSandboxInvoiceHtml(result.rows[0].issued_details);
}

export async function findSandboxInvoiceExportForCompany(pool,companyId,invoiceNumber,format="html"){
 if(!companyId||!invoiceNumber)return null;
 if(!["html","print","json"].includes(format))throw new Error("unsupported_invoice_format");
 const result=await pool.query("SELECT issued_details FROM sandbox_pos_monthly_invoice_drafts WHERE company_id=$1 AND invoice_number=$2 AND status='issued' AND issued_details IS NOT NULL",[companyId,invoiceNumber]);
 if(result.rowCount!==1)return null;
 const details=result.rows[0].issued_details;
 if(format==="print")return renderSandboxInvoicePrintHtml(details);
 if(format==="json")return exportSandboxInvoiceJson(details);
 if(format==="html")return renderSandboxInvoiceHtml(details);
 throw new Error("unsupported_invoice_format");
}
