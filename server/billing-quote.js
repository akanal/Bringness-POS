export function billingQuote(plan,term){
  const regular=Number(plan.amount_cents);
  const offered=Number(term?.monthly_net_cents);
  const net=plan.billing_type==="monthly"&&Number.isInteger(offered)&&offered>0?Math.min(regular,offered):regular;
  if(!Number.isSafeInteger(net)||net<1)throw Error("Ungültiger Tarifbetrag");
  const gross=Math.round(net*1.19);
  return {netCents:net,vatCents:gross-net,grossCents:gross};
}
