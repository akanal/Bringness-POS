export function normalizeSandboxInvoiceDate(value){
 const date=value instanceof Date?new Date(value.getTime()):typeof value==='string' && /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value)?new Date(value+'T00:00:00Z'):new Date(NaN);
 if(!Number.isFinite(date.getTime()))return null;
 if(typeof value==='string' && date.toISOString().slice(0,10)!==value)return null;
 return date;
}
