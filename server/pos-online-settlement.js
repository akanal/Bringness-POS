const methods = Object.freeze({
  web_pickup:'mollie_delivery',
  web_delivery:'mollie_delivery'
});

// Call inside the same transaction that locks and releases the verified provider payment.
export async function recordPosOnlineSettlement(client,{orderId,restaurantId,amountCents,center=false}) {
  if (!Number.isSafeInteger(amountCents) || amountCents<=0) throw Error('INVALID_ONLINE_PAYMENT_AMOUNT');
  const {rows:[order]} = await client.query(`SELECT source FROM orders
    WHERE id=$1 AND restaurant_id=$2 AND total_cents=$3 FOR UPDATE`,[orderId,restaurantId,amountCents]);
  // Some older Center orders have no source. Their Center payment binding identifies the channel.
  const method = order && (center && (order.source===null || order.source==='center')
    ? 'mollie_center'
    : !center && Object.hasOwn(methods,order.source) && methods[order.source]);
  if (!method) throw Error('INVALID_ONLINE_PAYMENT_ORDER');

  const {rows:[existing]} = await client.query('SELECT 1 FROM payments WHERE order_id=$1 LIMIT 1',[orderId]);
  if (existing) throw Error('ONLINE_PAYMENT_ALREADY_RECORDED');
  await client.query('INSERT INTO payments(order_id,method,amount_cents) VALUES ($1,$2,$3)',[orderId,method,amountCents]);
  const {rows:[sequence]} = await client.query("SELECT nextval('receipt_number_seq') n");
  const receiptNumber = 'BN-'+new Date().getUTCFullYear()+'-'+String(sequence.n).padStart(6,'0');
  const {rows:[receipt]} = await client.query(`INSERT INTO receipts (order_id,receipt_number,fiscal_status,merchant_snapshot)
    SELECT o.id,$2,'pending',jsonb_build_object(
      'businessName',coalesce(nullif(b.company_name,''),co.name),'restaurantName',r.name,
      'street',coalesce(b.street,''),'postalCode',coalesce(b.postal_code,''),'city',coalesce(b.city,''),
      'vatId',coalesce(b.vat_id,''))
    FROM orders o JOIN restaurants r ON r.id=o.restaurant_id JOIN companies co ON co.id=r.company_id
    LEFT JOIN company_billing_profiles b ON b.company_id=co.id WHERE o.id=$1 RETURNING receipt_number`,[orderId,receiptNumber]);
  if (!receipt) throw Error('ONLINE_PAYMENT_RECEIPT_MISSING');
  return receiptNumber;
}
