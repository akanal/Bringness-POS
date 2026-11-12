// Called only inside the existing authorized order/line correction transaction.
export async function correctWaiterDeposit(c,line,nextQty){
 const fail=message=>{throw Object.assign(Error(message),{status:409})};
 if(!line.product_id){if(String(line.product_name_snapshot||'').startsWith('Pfand:'))fail('Pfand folgt der Artikelmenge und kann nicht einzeln geändert werden.');return;}
 const rows=(await c.query('SELECT * FROM pos_deposit_lines WHERE order_id=$1 AND product_id=$2 ORDER BY id FOR UPDATE',[line.order_id,line.product_id])).rows;
 if(!rows.length){if(nextQty>Number(line.quantity)&&(await c.query('SELECT 1 FROM pos_deposit_rules WHERE product_id=$1',[line.product_id])).rowCount)fail('Für diesen nachträglich pfandpflichtigen Artikel bitte eine neue Bestellung anlegen.');return;}
 if(rows.length!==1||Number(line.quantity)<=0)fail('Pfandzuordnung zuerst an der Kasse prüfen.');const fee=rows[0],units=fee.quantity/Number(line.quantity),quantity=nextQty*units;
 if(!Number.isSafeInteger(units)||units<1||units>999||!Number.isSafeInteger(quantity)||quantity<0||quantity>9999999||fee.returned_qty>0)fail('Pfandmenge oder bereits gebuchte Rücknahme zuerst an der Kasse prüfen.');
 // Identical fee rows are financially interchangeable; preserve the stored rate/amount.
 const financial=(await c.query("SELECT id FROM order_items WHERE order_id=$1 AND product_id IS NULL AND product_name_snapshot=$2 AND unit_price_cents=$3 AND tax_rate_snapshot=$4 AND quantity=$5 ORDER BY id LIMIT 1 FOR UPDATE",[line.order_id,'Pfand: '+fee.label,fee.unit_cents,fee.tax_rate,fee.quantity])).rows[0];if(!financial)fail('Die gespeicherte Pfandposition stimmt nicht überein. Bitte an der Kasse prüfen.');
 await c.query('UPDATE pos_deposit_lines SET quantity=$2 WHERE id=$1',[fee.id,quantity]);await c.query('UPDATE order_items SET quantity=$2 WHERE id=$1',[financial.id,quantity]);
}
