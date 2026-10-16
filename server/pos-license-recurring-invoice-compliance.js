// Sandbox invoice completeness gate. This is not legal certification.
// German standard invoices normally require issuer identity, tax ID,
// customer, service description/period, dates, and VAT breakdown.
const filled=value=>typeof value==="string"&&value.trim().length>0;
export function validateSandboxInvoiceDetails({issuer,customer,servicePeriod,invoiceDate,invoiceNumber,netCents,vatCents,grossCents,serviceDescription,vatRatePercent}={}){
 const missing=[];
 if(!filled(issuer?.name)) missing.push("issuer.name");
 if(!filled(issuer?.address)) missing.push("issuer.address");
 if(!filled(issuer?.taxNumber)&&!filled(issuer?.vatId)) missing.push("issuer.taxNumber_or_vatId");
 if(!filled(customer?.name)) missing.push("customer.name");
 if(!filled(customer?.address)) missing.push("customer.address");
 if(!filled(servicePeriod?.start)||!filled(servicePeriod?.end)||
    !Number.isFinite(Date.parse(servicePeriod?.start))||
    !Number.isFinite(Date.parse(servicePeriod?.end))||
    Date.parse(servicePeriod?.end)<Date.parse(servicePeriod?.start)) missing.push("servicePeriod");
 if(!filled(serviceDescription)) missing.push("serviceDescription");
 if(vatRatePercent!==19) missing.push("vatRatePercent");
 if(!filled(invoiceNumber)) missing.push("invoiceNumber");
 if(!filled(invoiceDate)||!Number.isFinite(Date.parse(invoiceDate))) missing.push("invoiceDate");
 if(!Number.isSafeInteger(netCents)||netCents<=0||
    !Number.isSafeInteger(vatCents)||vatCents<0||
    !Number.isSafeInteger(grossCents)||grossCents!==netCents+vatCents||vatCents!==Math.round(netCents*19/100)) missing.push("amounts");
 return {ready:missing.length===0,missing};
}
