// Sandbox invoice completeness gate. This is not legal certification.
// German standard invoices normally require issuer identity, tax ID,
// customer, service description/period, dates, and VAT breakdown.
const filled=value=>typeof value==="string"&&value.trim().length>0;
const validIsoDate=value=>{if(typeof value!=="string"||!/^(\\d{4})-(\\d{2})-(\\d{2})$/.test(value))return false;const [year,month,day]=value.split("-").map(Number);const date=new Date(Date.UTC(year,month-1,day));return date.getUTCFullYear()===year&&date.getUTCMonth()===month-1&&date.getUTCDate()===day;};
export function validateSandboxInvoiceDetails({issuer,customer,servicePeriod,invoiceDate,invoiceNumber,netCents,vatCents,grossCents,serviceDescription,vatRatePercent}={}){
 const missing=[];
 if(!filled(issuer?.name)) missing.push("issuer.name");
 if(!filled(issuer?.address)) missing.push("issuer.address");
 if(!filled(issuer?.taxNumber)&&!filled(issuer?.vatId)) missing.push("issuer.taxNumber_or_vatId");
 if(!filled(customer?.name)) missing.push("customer.name");
 if(!filled(customer?.address)) missing.push("customer.address");
 if(!filled(servicePeriod?.start)||!filled(servicePeriod?.end)||
    !validIsoDate(servicePeriod?.start)||
    !validIsoDate(servicePeriod?.end)||
    servicePeriod?.end<servicePeriod?.start) missing.push("servicePeriod");
 if(!filled(serviceDescription)) missing.push("serviceDescription");
 if(vatRatePercent!==19) missing.push("vatRatePercent");
 if(!filled(invoiceNumber)) missing.push("invoiceNumber");
 if(!validIsoDate(invoiceDate)) missing.push("invoiceDate");
 if(!Number.isSafeInteger(netCents)||netCents<=0||
    !Number.isSafeInteger(vatCents)||vatCents<0||
    !Number.isSafeInteger(grossCents)||grossCents!==netCents+vatCents||vatCents!==Math.round(netCents*19/100)) missing.push("amounts");
 return {ready:missing.length===0,missing};
}
