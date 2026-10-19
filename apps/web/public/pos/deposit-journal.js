(()=>{
 window.bnDepositJournalCSV=async(query='',headers={})=>{
  const params=new URLSearchParams(query),rows=[],seen=new Set(),cursors=new Set();let cursor=null,asOf=null;
  do{if(cursor){if(cursors.has(cursor))throw Error('Journal-Seite wiederholt sich');cursors.add(cursor);params.set('cursor',cursor)}const r=await fetch('/api/v1/accountant/deposit-returns?'+params,{headers,cache:'no-store'}),j=await r.json();if(!r.ok)throw Error(j.error||'Journal nicht verfügbar');if(!Array.isArray(j.returns)||typeof j.asOf!=='string'||asOf&&j.asOf!==asOf)throw Error('Journal-Datenstand ungültig');asOf=j.asOf;
   for(const row of j.returns){if(!row.id||seen.has(row.id)||!Array.isArray(row.lines))throw Error('Journal enthält doppelte oder ungültige Rücknahmen');seen.add(row.id);for(const l of row.lines){const gross=l.qty*l.unitCents,net=Math.round(gross/(1+l.taxRate/100));rows.push([row.number,row.created_at,row.credited_order_id?'Im Verkaufsbeleg enthalten':'Barauszahlung',row.credited_order_id||'',l.receiptNumber,l.label,l.qty,(gross/100).toFixed(2),l.taxRate,(net/100).toFixed(2),((gross-net)/100).toFixed(2),row.reason])}}
   cursor=j.nextCursor;if(cursor!==null&&typeof cursor!=='string'||cursor&&!j.returns.length)throw Error('Journal-Seitenkennung ungültig');
  }while(cursor);
  const cell=v=>'"'+String(v??'').replace(/^[\s\uFEFF]*[=+\-@\t\r\n]/,"'$&").replaceAll('"','""')+'"';const csv='\ufeff'+[['Rücknahme','Datum','Abwicklung','Verrechneter Verkauf (ID)','Ursprungsbeleg','Pfand','Menge','Auszahlung EUR','Steuer %','Netto EUR','Steuer EUR','Grund'],...rows].map(r=>r.map(cell).join(';')).join('\n');const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download='Bringness-Pfandruecknahmen.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 };
})();
