// Shared implementation limits, not consent, tax advice or an access grant.
export function supportedDownloadBuyer(buyer){
 return Boolean(buyer&&['company_name','street','postal_code','city','country'].every(k=>typeof buyer[k]==='string'&&buyer[k].trim().length>=2&&buyer[k].length<=500&&!/[\u0000-\u001f\u007f]/.test(buyer[k]))&&['de','deutschland','germany'].includes(buyer.country.trim().toLowerCase()));
}
export function supportedDownloadInvoiceDate(date){
 if(typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date))return false;
 const parsed=new Date(date+'T00:00:00Z');return Number.isFinite(parsed.getTime())&&parsed.toISOString().slice(0,10)===date&&date>='2025-01-01'&&date<='2026-12-31';
}
export function downloadInvoiceDate(value){
 const date=new Date(value);if(!Number.isFinite(date.getTime()))return null;
 return new Intl.DateTimeFormat('en-CA',{year:'numeric',month:'2-digit',day:'2-digit',timeZone:'Europe/Berlin'}).format(date);
}
