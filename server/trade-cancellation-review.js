import {receiptLines} from './receipt-lines.js';

// Read-only preparation. Never treat a review as a cancellation or a refund.
export function cancellationReview(receipt, items, payments, deposits, creditedReturns) {
 const issues=[];
 const block=(code,message)=>issues.push({code,message});
 const total=Number(receipt.total_cents);
 if(!Number.isSafeInteger(total)||total<0)block('invalid_total','Der gespeicherte Rechnungsbetrag ist ungültig.');
 const lines=receiptLines(items,receipt.sale_adjustment);
 const validLines=lines.length>0&&lines.every(l=>Number.isSafeInteger(l.grossCents)&&Number.isSafeInteger(l.netCents)&&Number.isSafeInteger(l.taxCents)&&Number.isSafeInteger(Number(l.quantity))&&Number(l.quantity)>0);
 if(!validLines||lines.reduce((n,l)=>n+l.grossCents,0)!==total)block('line_mismatch','Rechnungspositionen und gespeicherter Gesamtbetrag stimmen nicht überein.');
 const validPayments=payments.length>0&&payments.every(p=>Number.isSafeInteger(Number(p.amount_cents))&&Number(p.amount_cents)>0);
 if(!validPayments||payments.reduce((n,p)=>n+Number(p.amount_cents),0)!==total)block('payment_mismatch','Die gespeicherten Zahlungen decken den Rechnungsbetrag nicht eindeutig.');
 if(receipt.order_status!=='paid')block('not_paid','Die ursprüngliche Bestellung ist nicht als bezahlt gespeichert.');
 if(payments.some(p=>p.method!=='cash'))block('provider_refund','Eine Anbieter- oder Kartenrückzahlung muss separat bestätigt werden.');
 if(deposits.some(d=>Number(d.returned_qty)>0))block('deposit_returned','Zu dieser Rechnung wurde bereits Pfand zurückgenommen. Eine pauschale Vollerstattung würde es doppelt erstatten.');
 if(creditedReturns.length)block('credited_return','Diese Rechnung verrechnet eine Pfandrückgabe. Die ursprüngliche Rücknahme muss bei einer Korrektur erhalten bleiben.');
 const taxRows=new Map();
 for(const l of lines){const key=l.mixedTax?'mixed':String(Number(l.tax_rate_snapshot)),row=taxRows.get(key)||{rate:key==='mixed'?null:Number(key),netCents:0,taxCents:0,grossCents:0};row.netCents-=l.netCents;row.taxCents-=l.taxCents;row.grossCents-=l.grossCents;taxRows.set(key,row);}
 return {
  status:'review_only',canCancel:false,
  original:{id:receipt.id,number:receipt.receipt_number,issuedAt:receipt.issued_at,totalCents:total},
  proposedReversalCents:Number.isSafeInteger(total)?-total:null,
  lines:lines.map(l=>({name:l.product_name_snapshot,quantity:Number(l.quantity),grossCents:-l.grossCents||0,netCents:-l.netCents||0,taxCents:-l.taxCents||0})),
  taxRows:[...taxRows.values()],payments:payments.map(p=>({method:p.method,amountCents:Number(p.amount_cents)})),
  issues,
  notice:'Nur Storno-Vorprüfung. Kein Gegenbeleg ausgestellt, keine Zahlung erstattet und kein Lagerbestand verändert.'
 };
}

export async function readCancellationReview(c,user,receiptId){
  const receipt=(await c.query(`SELECT rc.id,rc.receipt_number,rc.issued_at,rc.sale_adjustment,o.id order_id,o.status order_status,o.total_cents
   FROM receipts rc JOIN orders o ON o.id=rc.order_id JOIN pos_trade_sales t ON t.order_id=o.id
   JOIN restaurants r ON r.id=o.restaurant_id WHERE rc.id=$1 AND r.company_id=$2`,[receiptId,user.company_id])).rows[0];
  if(!receipt)return null;
  const items=(await c.query('SELECT product_id,product_name_snapshot,unit_price_cents,tax_rate_snapshot,quantity FROM order_items WHERE order_id=$1 ORDER BY id',[receipt.order_id])).rows;
  const payments=(await c.query('SELECT method,amount_cents FROM payments WHERE order_id=$1 ORDER BY created_at,id',[receipt.order_id])).rows;
  const deposits=(await c.query('SELECT returned_qty FROM pos_deposit_lines WHERE order_id=$1',[receipt.order_id])).rows;
  const credited=(await c.query('SELECT id FROM pos_deposit_returns WHERE credited_order_id=$1',[receipt.order_id])).rows;
  return cancellationReview(receipt,items,payments,deposits,credited);
}

export async function loadCancellationReview(pool,user,receiptId){
 const c=await pool.connect();
 try{
  await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const review=await readCancellationReview(c,user,receiptId);
  await c.query('COMMIT');return review;
 }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
}
