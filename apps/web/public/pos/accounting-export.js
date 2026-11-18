(()=>{
 const cell=value=>'"'+String(value??'').replace(/^[\s\uFEFF]*[=+\-@\t\r\n]/,"'$&").replaceAll('"','""')+'"';
 const csv=rows=>'\ufeff'+rows.map(row=>row.map(cell).join(';')).join('\n');
 const cents=value=>{if(!Number.isSafeInteger(value))throw Error('Export enthält einen ungültigen Centbetrag.');return (value/100).toFixed(2).replace('.',',')};
 function positions(receipts){
  const rows=[['Beleg','Datum UTC','Position','Artikel','Menge','Originalpreis EUR','Rabatt EUR','Positionsbetrag EUR','Steuersatz %']];
  for(const receipt of receipts){
   if(!Array.isArray(receipt.items))throw Error('Export enthält keine vollständigen Belegpositionen.');
   for(const [index,item] of receipt.items.entries()){
    if(!Number.isFinite(Number(item.quantity))||!Number.isFinite(Number(item.taxRate)))throw Error('Export enthält eine ungültige Belegposition.');
    rows.push([receipt.receipt_number,receipt.issued_at,index+1,item.name,item.quantity,cents(item.unitPriceCents),cents(item.discountCents),cents(item.lineTotalCents),item.taxRate]);
   }
  }
  return csv(rows);
 }
 function closings(records){
  const rows=[['Kassenschicht','Geöffnet UTC','Geschlossen UTC','Anfangsbestand EUR','Sollbestand EUR','Gezählt EUR','Differenz EUR','Zahlungen EUR (nach Zahlungsart)','Begründung']];
  for(const record of records){
   if(!Array.isArray(record.payments))throw Error('Export enthält unvollständige Kassenabschlüsse.');
   rows.push([record.id,record.opened_at,record.closed_at,cents(record.openingCents),cents(record.expectedCents),cents(record.countedCents),cents(record.differenceCents),record.payments.map(p=>p.method+' / '+p.mode+': '+cents(Number(p.amount_cents))).join(' | '),record.reason]);
  }
  return csv(rows);
 }
 window.bnAccountingExports={positions,closings};
})();
