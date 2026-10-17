// Subscription entitlement decision independent of POS production tables.
// Cancellation/past-due does not revoke time that was already paid for.
export function sandboxMonthlyAccess({status,paidThrough},at=new Date()){
 const until=new Date(paidThrough);
 const paid=Number.isFinite(until.getTime()) && until.getTime()>new Date(at).getTime();
 return {allowed:paid && ["active","past_due","canceled"].includes(status),
   paidThrough:paidThrough||null};
}
