(()=>{
 const $=id=>document.getElementById(id);let token=location.hash.slice(1),receipts=[],scope=null,epoch=0;
 history.replaceState(null,'',location.pathname);
 const buttons=['csv','json','positions','closings','closingsJson'];
 const disable=()=>buttons.forEach(id=>{$(id).disabled=true});
 const save=(name,type,data)=>{const url=URL.createObjectURL(new Blob([data],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};
 const cell=v=>'"'+String(v??'').replace(/^[\s\uFEFF]*[=+\-@\t\r\n]/,"'$&").replaceAll('"','""')+'"';
 const valid=version=>version===epoch&&!!token;
 function clear(){epoch++;receipts=[];scope=null;disable();$('rows').replaceChildren();$('cashStatus').textContent=''}
 async function page(path,cursor){
  const r=await fetch('/api/v1/accountant/'+path+(cursor?'?cursor='+encodeURIComponent(cursor):''),{headers:{authorization:'Bearer '+token},cache:'no-store'}),j=await r.json();
  if(!r.ok)throw Error(j.error||'Zugang momentan nicht verfügbar.');return j;
 }
 function metadata(j){return {restaurantId:j.restaurantId,from:j.from,to:j.to,asOf:j.asOf}}
 function validatePage(j,expected,key){
  const meta=metadata(j);
  if(!Array.isArray(j[key])||typeof j.asOf!=='string'||!Number.isFinite(Date.parse(j.asOf))||expected&&JSON.stringify(meta)!==JSON.stringify(expected))throw Error('Exportzeitraum oder Datenstand wurde verändert.');
  if(j.nextCursor!==null&&(typeof j.nextCursor!=='string'||!j.nextCursor)||j.nextCursor&&!j[key].length)throw Error('Ungültige Exportseitenkennung');
  return meta;
 }
 async function load(){
  clear();const version=epoch;$('status').textContent='Belege werden geladen…';
  try{
   if(!token)throw Error('Bitte den vollständigen freigegebenen Zugangslink öffnen.');
   let cursor=null;const seen=new Set(),cursors=new Set(),loaded=[];let meta=null;
   do{
    if(cursor){if(cursors.has(cursor))throw Error('Exportseite wiederholt sich. Bitte Zugang neu öffnen.');cursors.add(cursor)}
    const j=await page('receipts',cursor);if(!valid(version))return;
    meta=validatePage(j,meta,'receipts');
    for(const r of j.receipts){if(!r||typeof r.id!=='string'||!r.id||seen.has(r.id)||!Number.isSafeInteger(r.total_cents)||!Array.isArray(r.payments))throw Error('Export enthält unvollständige oder doppelte Belege.');seen.add(r.id);loaded.push(r)}
    if(loaded.length>100000)throw Error('Export zu groß. Bitte einen kleineren Zeitraum freigeben.');
    cursor=j.nextCursor;$('status').textContent=loaded.length+' Belege geladen…';
   }while(cursor);
   if(!valid(version))return;receipts=loaded;scope=meta;
   for(const r of receipts){const tr=document.createElement('tr');for(const text of [r.receipt_number,new Date(r.issued_at).toLocaleString('de-DE',{timeZone:'Europe/Berlin',hourCycle:'h23'}),(r.total_cents/100).toLocaleString('de-DE',{style:'currency',currency:'EUR'}),r.fiscal_status]){const td=document.createElement('td');td.textContent=text;tr.append(td)}$('rows').append(tr)}
   $('status').textContent=receipts.length+' Belege · '+scope.from+' bis '+scope.to+' · Zeitangaben Europe/Berlin';buttons.forEach(id=>{$(id).disabled=false});
  }catch(e){if(valid(version)||!token&&version===epoch){receipts=[];scope=null;disable();$('status').textContent=e.message}}
 }
 $('csv').onclick=()=>{if(!scope)return;save('Bringness-Belege.csv','text/csv;charset=utf-8','\ufeff'+[['Beleg','Datum UTC','Zwischensumme EUR','Rabatt EUR','Betrag EUR','Zahlungen','Fiskalstatus'],...receipts.map(r=>[r.receipt_number,r.issued_at,((r.sale_adjustment?.subtotalCents??r.total_cents)/100).toFixed(2),((r.sale_adjustment?.discountCents||0)/100).toFixed(2),(r.total_cents/100).toFixed(2),r.payments.map(p=>p.method+':'+(p.amountCents/100).toFixed(2)).join(' / '),r.fiscal_status])].map(row=>row.map(cell).join(';')).join('\n'))};
 $('json').onclick=()=>{if(scope)save('Bringness-Pruefpaket.json','application/json',JSON.stringify({...scope,receipts,officialDsfinvk:false},null,2))};
 $('positions').onclick=()=>{try{if(scope)save('Bringness-Belegpositionen.csv','text/csv;charset=utf-8',window.bnAccountingExports.positions(receipts))}catch(e){$('status').textContent=e.message}};
 async function cashExport(json){
  if(!scope)return;const version=epoch,expectedScope=scope;let cursor=null,meta=null;const records=[],seen=new Set(),cursors=new Set();$('closings').disabled=$('closingsJson').disabled=true;
  try{
   do{
    if(cursor){if(cursors.has(cursor))throw Error('Abschlussseite wiederholt sich.');cursors.add(cursor)}
    const j=await page('cash-closings',cursor);if(!valid(version))return;meta=validatePage(j,meta,'closings');
    if(j.restaurantId!==expectedScope.restaurantId||j.from!==expectedScope.from||j.to!==expectedScope.to)throw Error('Freigabezeitraum wurde verändert.');
    for(const r of j.closings){if(!r||typeof r.id!=='string'||seen.has(r.id))throw Error('Doppelte oder ungültige Kassenabschlüsse.');seen.add(r.id);records.push(r)}
    if(records.length>100000)throw Error('Export zu groß. Bitte einen kleineren Zeitraum freigeben.');cursor=j.nextCursor;
   }while(cursor);
   if(!valid(version))return;
   const csv=window.bnAccountingExports.closings(records);
   save(json?'Bringness-Kassenabschluesse.json':'Bringness-Kassenabschluesse.csv',json?'application/json':'text/csv;charset=utf-8',json?JSON.stringify({format:'bringness-cash-closings-v1',...meta,officialDsfinvk:false,closings:records},null,2):csv);
   $('cashStatus').textContent=records.length+' gespeicherte Kassenabschlüsse exportiert.';
  }catch(e){if(valid(version))$('cashStatus').textContent=e.message}finally{if(valid(version)&&scope)$('closings').disabled=$('closingsJson').disabled=false}
 }
 $('closings').onclick=()=>cashExport(false);$('closingsJson').onclick=()=>cashExport(true);$('retry').onclick=load;
 $('leave').onclick=()=>{clear();token='';$('status').textContent='Zugang geschlossen. Zum erneuten Öffnen den vollständigen Freigabelink verwenden.'};
 addEventListener('pagehide',()=>{clear();token=''});
 if(window.bnDepositJournalCSV){const b=document.createElement('button');b.type='button';b.textContent='Pfandrücknahmen CSV';b.onclick=async()=>{if(!token)return;b.disabled=true;const version=epoch;try{await window.bnDepositJournalCSV('',{authorization:'Bearer '+token},()=>valid(version))}catch(e){if(valid(version))$('status').textContent=e.message}finally{b.disabled=false}};$('csv').parentElement.append(b)}
 load();
})();
