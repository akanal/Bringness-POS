(()=>{
 window.bnCashReversal=async(receiptId,number,amount)=>{
  const key='bringness.cash-reversal.pending.v1:'+receiptId;let pending;try{pending=JSON.parse(localStorage.getItem(key)||'null')}catch{throw Error('Lokaler Stornoauftrag muss abgeglichen werden.');}
  if(!await window.ensurePersonnelAccess?.())throw Error('Verwaltungs-PIN erforderlich');
  if(!pending){const reason=prompt('Stornogrund für '+number+' (mindestens 3 Zeichen):');if(reason==null)return;if(reason.trim().length<3||reason.length>500)throw Error('Stornogrund mit 3 bis 500 Zeichen erforderlich');if(!confirm('Gesamten Barverkauf '+number+' über '+euro(amount)+' stornieren und '+euro(amount)+' bar auszahlen? Originalbeleg bleibt erhalten. Lagerbestand wird nicht automatisch zurückgebucht.'))return;pending={requestKey:crypto.randomUUID(),reason:reason.trim(),cashPayoutConfirmed:true};localStorage.setItem(key,JSON.stringify(pending));}
  const result=await api('/receipts/'+receiptId+'/cash-reversal',{method:'POST',body:JSON.stringify(pending)});
  if(result.requestKey!==pending.requestKey||result.originalReceiptId!==receiptId||result.method!=='cash')throw Error('Stornobestätigung unvollständig. Dieselbe Buchung erneut abgleichen.');
  localStorage.removeItem(key);alert((result.replayed?'Vorheriges Storno abgeglichen. Kein zweites Mal auszahlen. ':'Storno gebucht. ')+result.receiptNumber+' · Barerstattung '+euro(result.refundedCents)+'. Lagerkorrektur bei Bedarf separat durchführen.');await renderReceipts(document.getElementById('restaurant').value);
 };
})();
