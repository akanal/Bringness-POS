import assert from 'node:assert/strict';
import crypto from 'node:crypto';
export async function verifyDepositFlow({send,query,restaurant,product,token,unlock,request,setFail}){
 const rid=restaurant,rules={restaurantId:rid,productId:product,amountCents:25,units:24,label:'Flasche im Kasten',taxRate:19};
 assert.equal((await send('/deposit/rules','PUT',rules)).status,403);
 assert.equal((await send('/deposit/rules','PUT',rules,token,unlock)).status,200);
 await query('CREATE TABLE IF NOT EXISTS pos_offline_catalogs(company_id uuid,payload jsonb)');
 await query("INSERT INTO pos_offline_catalogs SELECT company_id,jsonb_build_object('validUntil',(now()+interval '1 hour')::text,'products',jsonb_build_array(jsonb_build_object('id',$2::text))) FROM restaurants WHERE id=$1",[rid,product]);
 assert.equal((await send('/deposit/rules','PUT',{...rules,amountCents:30},token,unlock)).status,409);await query('DELETE FROM pos_offline_catalogs');
 const blockedOrder=crypto.randomUUID();await query('BEGIN');try{await query("INSERT INTO orders(id,restaurant_id,source) VALUES($1,$2,'qr')",[blockedOrder,rid]);await assert.rejects(query("INSERT INTO order_items(order_id,product_id,product_name_snapshot,unit_price_cents,tax_rate_snapshot,quantity) VALUES($1,$2,'Blocked',100,19,1)",[blockedOrder,product]),/Pfandartikel/);}finally{await query('ROLLBACK');}
 const cash=await send('/cash-sessions','POST',{restaurantId:rid,requestKey:crypto.randomUUID(),action:'open',amountCents:10000});assert.equal(cash.status,200);
 const sell={...request,requestKey:crypto.randomUUID(),items:[{productId:product,qty:2}],discount:{kind:'percent',value:5000},payments:[{method:'cash',amountCents:1700}]};
 // 2 x 500 wholesale gross, 50% merchandise discount, plus 48 x 25 deposit.
 assert.equal((await send('/orders/checkout','POST',{...sell,payments:[{method:'cash',amountCents:500}]})).status,400);
 const sale=await send('/orders/checkout','POST',sell);assert.equal(sale.status,201);assert.equal(sale.body.totalCents,1700);
 assert.equal((await send('/orders/checkout','POST',sell)).body.replayed,true);
 const invoice=await send('/receipts/'+sale.body.receiptId+'/invoice');assert.equal(invoice.status,200);const {getDocument}=await import('pdfjs-dist/legacy/build/pdf.mjs');const loading=getDocument({data:new Uint8Array(invoice.body),useSystemFonts:true}),pdf=await loading.promise;let text='';for(let p=1;p<=pdf.numPages;p++)text+=(await (await pdf.getPage(p)).getTextContent()).items.map(i=>i.str).join(' ');assert.match(text,/Pfand:/);assert.match(text,/17,00/);await loading.destroy();
 const deposits=(await send('/deposit/returns?restaurantId='+rid+'&receiptNumber='+sale.body.receiptNumber)).body.lines;assert.equal(deposits.length,1);assert.equal(deposits[0].quantity,48);
 const fee=(await query("SELECT * FROM order_items WHERE order_id=$1 AND product_name_snapshot LIKE 'Pfand:%'",[sale.body.id])).rows[0];assert.equal(fee.unit_price_cents,25);assert.equal(Number(fee.quantity),48);
 // Current configuration changes must never reprice original refunds.
 await send('/deposit/rules','PUT',{...rules,amountCents:30},token,unlock);
 const refund={restaurantId:rid,requestKey:crypto.randomUUID(),items:[{lineId:deposits[0].id,qty:24}],reason:'Test Leergut'};
 setFail(true);assert.equal((await send('/deposit/returns','POST',refund)).status,503);setFail(false);assert.equal((await query('SELECT returned_qty FROM pos_deposit_lines WHERE id=$1',[deposits[0].id])).rows[0].returned_qty,0);
 const returned=await send('/deposit/returns','POST',refund);assert.equal(returned.status,201);assert.equal(returned.body.return.amount_cents,600);
 assert.equal((await send('/deposit/returns','POST',refund)).body.replayed,true);const returnPdf=await send('/deposit/returns/'+returned.body.return.id+'/pdf');assert.equal(returnPdf.status,200);assert.equal(returnPdf.body.subarray(0,4).toString(),'%PDF');
 assert.equal((await send('/deposit/returns','POST',{...refund,items:[{lineId:deposits[0].id,qty:25}]})).status,409);
 assert.equal((await send('/deposit/returns','POST',{...refund,requestKey:crypto.randomUUID(),items:[{lineId:deposits[0].id,qty:25}]})).status,409);
 const snapshot=(await send('/cash-sessions?restaurantId='+rid)).body.sessions.find(s=>s.id===cash.body.session.id);assert.equal(snapshot.expectedCents,11100);assert.equal(snapshot.deposit.chargedCents,1200);assert.equal(snapshot.deposit.returnedCents,600);
 const retail={requestKey:crypto.randomUUID(),restaurantId:rid,items:[{productId:product,qty:1}],payments:[{method:'cash',amountCents:10419}],depositReturns:[{lineId:deposits[0].id,qty:12}],depositCreditCents:300,depositReturnReason:'Verrechnung im Einkauf'}; // 9999 merchandise + 24 x 30
 setFail(true);assert.equal((await send('/orders/checkout','POST',retail)).status,503);setFail(false);assert.equal((await query('SELECT returned_qty FROM pos_deposit_lines WHERE id=$1',[deposits[0].id])).rows[0].returned_qty,24);const credited=await send('/orders/checkout','POST',retail);assert.equal(credited.status,201);assert.equal((await send('/orders/checkout','POST',retail)).body.replayed,true);assert.equal((await query("SELECT unit_price_cents FROM order_items WHERE order_id=$1 AND product_name_snapshot LIKE 'Pfandrücknahme:%'",[credited.body.id])).rows[0].unit_price_cents,-25);
 const retailReceipt=(await query('SELECT id FROM receipts WHERE order_id=$1',[credited.body.id])).rows[0];const retailPdf=await send('/receipts/'+retailReceipt.id+'/pdf');assert.equal(retailPdf.status,200);const retailLoading=getDocument({data:new Uint8Array(retailPdf.body),useSystemFonts:true}),retailDocument=await retailLoading.promise;let retailText='';for(let page=1;page<=retailDocument.numPages;page++)retailText+=(await(await retailDocument.getPage(page)).getTextContent()).items.map(i=>i.str).join(' ');assert.match(retailText,/Pfand:/);assert.match(retailText,/Pfandrücknahme:/);await retailLoading.destroy();
 await send('/deposit/rules','PUT',{...rules,amountCents:0},token,unlock);
 if(process.env.CHECKOUT_TEST_DATABASE_URL){const replies=await Promise.all([1,2].map(()=>send('/deposit/returns','POST',{...refund,requestKey:crypto.randomUUID(),items:[{lineId:deposits[0].id,qty:12}]})));assert.equal(replies.filter(r=>r.status===201).length,1);assert.equal(replies.filter(r=>r.status===409).length,1);}else assert.equal((await send('/deposit/returns','POST',{...refund,requestKey:crypto.randomUUID(),items:[{lineId:deposits[0].id,qty:12}]})).body.return.amount_cents,300);
 assert.equal((await send('/deposit/returns','POST',{...refund,requestKey:crypto.randomUUID(),items:[{lineId:deposits[0].id,qty:1}]})).status,409);
 console.log('Deposit flow passed: PIN configuration, retail/wholesale charges, crate quantities, discount exclusion, original-price refund, duplicate/over-return guards and exact cash separation.');
}
