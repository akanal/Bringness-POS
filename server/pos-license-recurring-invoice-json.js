// Construct a portable machine-readable sandbox invoice export.
// Not an EN16931/XRechnung/ZUGFeRD compliant e-invoice.
export function exportSandboxInvoiceJson(details){
 if(!details?.invoiceNumber||!details?.issuer?.name||!details?.customer?.name)
  throw new Error("issued_invoice_details_required");
 return JSON.stringify({
  format:"bringness-sandbox-invoice-v1",
  invoiceNumber:details.invoiceNumber,invoiceDate:details.invoiceDate,
  supplier:details.issuer,buyer:details.customer,
  service:details.serviceDescription,period:details.servicePeriod,
  currency:"EUR",netCents:details.netCents,
  vatRatePercent:details.vatRatePercent,vatCents:details.vatCents,
  grossCents:details.grossCents
 });
}
