// Invoice export hardening: validate issued snapshots before rendering.
import {validateSandboxInvoiceDetails} from "./pos-license-recurring-invoice-compliance.js";
export function assertIssuedSandboxInvoice(details){
 if(details?.currency!=="EUR")throw new Error("invalid_issued_invoice_currency");
 const check=validateSandboxInvoiceDetails({
  issuer:details?.issuer,customer:details?.customer,servicePeriod:details?.servicePeriod,
  serviceDescription:details?.serviceDescription,invoiceDate:details?.invoiceDate,
  invoiceNumber:details?.invoiceNumber,netCents:details?.netCents,
  vatCents:details?.vatCents,grossCents:details?.grossCents,
  vatRatePercent:details?.vatRatePercent
 });
 if(!check.ready)throw new Error("invalid_issued_invoice_snapshot:"+check.missing.join(","));
 return details;
}
