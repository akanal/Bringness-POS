export function billingQuote(plan,term){
  const regular=Number(plan.amount_cents);
  const offered=Number(term?.monthly_net_cents);
  const net=plan.billing_type==="monthly"&&Number.isInteger(offered)&&offered>0?Math.min(regular,offered):regular;
  if(!Number.isSafeInteger(net)||net<1||typeof plan.amount_cents==='boolean')throw Error("Ungültiger Tarifbetrag");
  const vat=Number((BigInt(net)*19n+50n)/100n),gross=net+vat;
  if(!Number.isSafeInteger(gross)||gross>2147483647)throw Error('Tarifbetrag überschreitet sichere Buchungsgrenze');
  return {netCents:net,vatCents:gross-net,grossCents:gross};
}
