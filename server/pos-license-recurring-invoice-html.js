// Render an escaped, printable sandbox invoice from a persisted issuance snapshot.
// This is an HTML print view, not an EN16931 structured e-invoice.
const escapeHtml=value=>String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
const eur=cents=>(cents/100).toFixed(2).replace(".",",")+" €";
export function renderSandboxInvoiceHtml(details){
 if(!details||typeof details!=="object"||!details.invoiceNumber||!details.issuer?.name||!details.customer?.name)
  throw new Error("issued_invoice_details_required");
 const line=value=>escapeHtml(value);
 return `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Rechnung ${line(details.invoiceNumber)}</title><style>body{font:16px system-ui;max-width:760px;margin:48px auto;padding:16px}table{width:100%;border-collapse:collapse}td,th{padding:10px;border-bottom:1px solid #ddd;text-align:left}footer{margin-top:36px;font-size:13px}</style></head><body><h1>Rechnung ${line(details.invoiceNumber)}</h1><p>Rechnungsdatum: ${line(details.invoiceDate)}</p><p><strong>Rechnungsaussteller</strong><br>${line(details.issuer.name)}<br>${line(details.issuer.address)}<br>Steuernummer/USt-ID: ${line(details.issuer.taxNumber||details.issuer.vatId)}</p><p><strong>Rechnungsempfänger</strong><br>${line(details.customer.name)}<br>${line(details.customer.address)}</p><p>Leistungszeitraum: ${line(details.servicePeriod?.start)} bis ${line(details.servicePeriod?.end)}</p><table><thead><tr><th>Leistung</th><th>Betrag</th></tr></thead><tbody><tr><td>${line(details.serviceDescription)}</td><td>${eur(details.netCents)}</td></tr><tr><td>Umsatzsteuer (${line(details.vatRatePercent)} %)</td><td>${eur(details.vatCents)}</td></tr><tr><th>Gesamt</th><th>${eur(details.grossCents)}</th></tr></tbody></table><footer>Sandbox-Beleg – nicht für den Produktiveinsatz.</footer></body></html>`;
}
