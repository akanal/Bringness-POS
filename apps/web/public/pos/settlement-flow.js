(()=>{
 const busy=new Set();
 window.bnHasPendingTable=tableId=>{try{return !!localStorage.getItem('bringness.table-settlement.pending.v1:'+tableId);}catch{return false;}};
 window.bnSettleTable=async selection=>{
  if(busy.has(selection.tableId))throw Error('Tischzahlung wird bereits abgeglichen.');
  const key='bringness.table-settlement.pending.v1:'+selection.tableId;
  let pending;
  try{const raw=localStorage.getItem(key);pending=raw?JSON.parse(raw):null;if(pending&&(!pending.body||pending.body.tableId!==selection.tableId||typeof pending.body.requestKey!=='string'))throw Error('invalid');}
  catch{throw Error('Zahlungsspeicher nicht verfügbar oder ungültig. Keine Tischzahlung ausgelöst.');}
  if(!pending||pending.correctable){
   if(selection.paymentMethod!=='cash')throw Error('Kartenzahlung erst nach serverseitig verifizierter Terminalanbindung verfügbar.');
   if(!pending&&!crypto.randomUUID)throw Error('Sichere Zahlungskennung nicht verfügbar. Bitte HTTPS verwenden.');
   pending={body:{requestKey:pending?.body.requestKey||crypto.randomUUID(),tableId:selection.tableId,paymentMethod:'cash',orderIds:[...selection.orderIds],expectedTotalCents:selection.expectedTotalCents}};
  }
  try{localStorage.setItem(key,JSON.stringify(pending));}catch{throw Error('Tischzahlung kann nicht sicher gespeichert werden. Keine Zahlung ausgelöst.');}
  busy.add(selection.tableId);
  try{
   const result=await api('/tables/settle',{method:'POST',body:JSON.stringify(pending.body)});
   if(!result||result.requestKey!==pending.body.requestKey||result.tableId!==selection.tableId||result.method!=='cash'||result.totalCents!==pending.body.expectedTotalCents||result.paidOrders!==pending.body.orderIds.length||!Array.isArray(result.receiptIds)||!Array.isArray(result.receiptNumbers)||result.receiptIds.length!==result.paidOrders||result.receiptNumbers.length!==result.paidOrders)throw Error('Unvollständige Bestätigung der Tischzahlung.');
   try{localStorage.removeItem(key);}catch{}
   return result;
  }catch(error){
   if(error.code==='SETTLEMENT_CHANGED'){pending.correctable=true;try{localStorage.setItem(key,JSON.stringify(pending));}catch{}}
   throw Error(error.message+' Zahlungsstatus prüfen; mit derselben Kennung abgleichen und Bargeld nicht erneut kassieren.');
  }finally{busy.delete(selection.tableId);}
 };
})();
