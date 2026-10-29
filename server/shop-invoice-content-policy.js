// Isolated draft validation only; not a legal or tax certification.
const required=(value)=>typeof value==='string'&&value.trim().length>0&&value.length<=500;
export function validateShopInvoiceContent(invoice){
 if(!invoice||typeof invoice!=='object'||Array.isArray(invoice))throw Error('SHOP_INVOICE_INVALID');
 for(const key of ['sellerName','sellerAddress','buyerName','buyerAddress','description','serviceDate','issueDate','sellerTaxId']){
  if(!required(invoice[key]))throw Error('SHOP_INVOICE_FIELD_INVALID:'+key);
 }
 for(const key of ['issueDate','serviceDate']){
  const value=invoice[key];
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||Number.isNaN(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value)throw Error('SHOP_INVOICE_DATE_INVALID:'+key);
 }
 if(!Array.isArray(invoice.taxLines)||invoice.taxLines.length<1)throw Error('SHOP_INVOICE_TAX_LINES_REQUIRED');
 let gross=0,net=0,tax=0;
 for(const line of invoice.taxLines){
  if(!line||!Number.isSafeInteger(line.netCents)||line.netCents<0||!Number.isSafeInteger(line.taxCents)||line.taxCents<0||![0,7,19].includes(line.taxRate))throw Error('SHOP_INVOICE_TAX_LINE_INVALID');
  if(Math.abs(line.taxCents-Math.round(line.netCents*line.taxRate/100))>1)throw Error('SHOP_INVOICE_TAX_MISMATCH');
  net+=line.netCents;tax+=line.taxCents;gross+=line.netCents+line.taxCents;
  if(!Number.isSafeInteger(gross)||!Number.isSafeInteger(net)||!Number.isSafeInteger(tax))throw Error('SHOP_INVOICE_AMOUNT_OVERFLOW');
 }
 if(!Number.isSafeInteger(invoice.totalCents)||invoice.totalCents<=0||invoice.totalCents!==gross)throw Error('SHOP_INVOICE_TOTAL_MISMATCH');
 return Object.freeze({totalCents:gross,netCents:net,taxCents:tax,currency:'EUR'});
}
