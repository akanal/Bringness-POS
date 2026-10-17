// No live invoices are issued here. Produce a deterministic sandbox
// invoice draft only after a verified paid transaction has been persisted.
// Legal invoice numbers must be allocated atomically by the invoicing service.
const NET_CENTS={online_pos:2999,restaurant_module:6999,qr_module:2999};
export function buildSandboxMonthlyInvoiceDraft({
 companyId,planCode,paymentId,currency="EUR",paymentStatus,customerBilling
}){
 const net=Object.hasOwn(NET_CENTS,planCode)?NET_CENTS[planCode]:undefined;
 if(!companyId || !/^tr_[A-Za-z0-9]+$/.test(String(paymentId||"")) ||
    !net || currency!=="EUR" || paymentStatus!=="paid")
  return {ready:false,reason:"verified_paid_payment_required"};
 if(typeof customerBilling?.name!=="string"||!customerBilling.name.trim()||typeof customerBilling?.address!=="string"||!customerBilling.address.trim())
  return {ready:false,reason:"customer_billing_details_required"};
 const vat=Math.round(net*19/100);
 return {ready:true,draft:{
  companyId,planCode,paymentId,currency,netCents:net,
  vatRatePercent:19,vatCents:vat,grossCents:net+vat,
  customerBilling:{name:customerBilling.name.trim(),address:customerBilling.address.trim()},
  status:"draft",invoiceNumber:null,issueDate:null
 }};
}
