// Keep synchronization single-flight and acknowledge only accepted sales.
export function createOfflineSync({ledger,connect,notify=()=>{},now=Date.now}) {
 let running=null,lastCatalog=0;
 let status={state:'idle',message:'Noch keine Synchronisierung',lastSuccess:null};
 // UI windows may close while a transfer is in flight. Observer failures
 // must never abort durable acknowledgements or the background recovery loop.
 const notifySafely=()=>{try{notify();}catch{}};
 const publish=(next)=>{status={...status,...next};notifySafely();};
 const run=async(force)=>{
  publish({state:'syncing',message:'Verkäufe werden übertragen …'});
  try {
   if(typeof connect!=='function')throw Error('Offline-Verbindung ist nicht konfiguriert');const request=await connect();
   if(request!=null&&typeof request!=='function')throw Error('Offline-Verbindung liefert keine gültige Schnittstelle');
   if(request==null){
    const outstanding=await ledger.pendingCount();
    publish({state:'login',message:outstanding?outstanding+' Verkäufe warten auf die Online-Anmeldung.':'Online-Kasse öffnen und anmelden.'});
    return {...status};
   }
   // Drain all batches, including more than 100 pending sales, before refreshing.
   const skipped=new Set();
   const attempted=new Set();
   const serverReceiptIds=new Map();
   const serverReceiptNumbers=new Map();
   let acknowledged=0;
   let pending=await ledger.pending();
   let failed=0;
   while(pending.length){
    publish({state:'syncing',message:(await ledger.pendingCount())+' offene Verkäufe werden abgeglichen …'});
    const batch=pending.slice(0,20);if(batch.some(sale=>!sale||typeof sale!=='object'||Array.isArray(sale)))throw Error('Ungültiger Offline-Verkauf in der Warteschlange');if(new Set(batch.map(sale=>sale?.id)).size!==batch.length)throw Error('Doppelte Verkaufskennung in der Offline-Warteschlange');if(batch.some(sale=>!sale||typeof sale.id!=='string'))throw Error('Ungültige Offline-Verkaufskennung in der Warteschlange');if(batch.some(sale=>attempted.has(sale.id)))throw Error('Offline-Verkauf wurde innerhalb desselben Abgleichs erneut geladen');if(batch.some(sale=>!sale||typeof sale.id!=='string'||!sale.request||typeof sale.request!=='object'||Array.isArray(sale.request)||sale.request.id!==sale.id||typeof sale.request.snapshotId!=='string'||!sale.request.snapshotId.trim()||typeof sale.request.restaurantId!=='string'||!sale.request.restaurantId.trim()))throw Error('Ungültiger Offline-Verkauf in der Warteschlange');
    for(const sale of batch)attempted.add(sale.id);
    let response;
    try{response=await request('batch',{sales:batch.map(s=>s.request)});}
    catch(error){
     // A lost response does not mean the server failed to commit the sales.
     // Keep every uncertain sale pending; the server deduplicates by sale ID.
     throw Error('Verbindung während der Übertragung unterbrochen. Offene Verkäufe bleiben gespeichert und werden erneut abgeglichen.',{cause:error});
    }
    if(!response||typeof response!=='object'||Array.isArray(response)||!Array.isArray(response.results)||response.results.length!==batch.length||response.results.some(result=>!result||typeof result!=='object'||Array.isArray(result)))throw Error('Unvollständige Antwort der Offline-Synchronisierung');
    // Match acknowledgements by immutable sale ID, not response ordering.
    // Duplicate or unknown IDs make the entire response ambiguous: retry safely.
    const resultsById=new Map();
    const expectedIds=new Set(batch.map(sale=>sale.id));if(expectedIds.size!==batch.length)throw Error('Doppelte Verkaufskennung in der Offline-Warteschlange');
    for(const result of response.results){
     if(typeof result?.offlineId!=='string'||!expectedIds.has(result.offlineId)||resultsById.has(result.offlineId))throw Error('Offline-Antwort enthält doppelte oder ungültige Verkaufskennungen');
     resultsById.set(result.offlineId,result);
    }
    if(batch.some(sale=>!resultsById.has(sale.id)))throw Error('Offline-Antwort enthält fremde oder fehlende Verkaufskennungen');
    if(response.results.some(result=>typeof result.ok!=='boolean'||(result.ok===false&&(typeof result.error!=='string'||!result.error.trim()))))throw Error('Offline-Antwort enthält einen unklaren Verkaufsstatus');
    // Conflicting receipt identities make every acknowledgement in this batch
    // ambiguous. Keep all local sales pending instead of accepting the first.
    const receiptOwners=new Map(),cloudOwners=new Map();
    let conflicting=false;
    for(const sale of batch){
     const result=resultsById.get(sale.id);
     if(result.ok!==true)continue;
     const scope=JSON.stringify([sale.request.restaurantId,result.receiptNumber]);
     if((typeof result.id==='string'&&cloudOwners.has(result.id)&&cloudOwners.get(result.id)!==sale.id)||
        (typeof result.receiptNumber==='string'&&receiptOwners.has(scope)&&receiptOwners.get(scope)!==sale.id))conflicting=true;
     cloudOwners.set(result.id,sale.id);
     receiptOwners.set(scope,sale.id);
    }
    if(conflicting){
     failed++;
     for(const sale of batch)skipped.add(sale.id);
     try{await ledger.error(batch[0].id,'Mehrdeutige Serverbelege; gesamte Übertragung bleibt zur Prüfung offen.');}catch{}
     pending=await ledger.pending(Array.from(attempted));
     continue;
    }
    // Server replies must not claim a sale succeeded without a usable receipt.
    // Invalid entries remain queued while valid entries can still be acknowledged.
    for(let index=0;index<batch.length;index++){
     const sale=batch[index],result=resultsById.get(sale.id);
     const receiptScope=JSON.stringify([sale.request.restaurantId||'',result.receiptNumber||'']);
     // Reject a cloud receipt that is already tied to a different sale, even if its number matches.
     if(result?.offlineId!==sale.id)throw Error('Offline-Antwort stimmt nicht mit der Verkaufskennung überein');
     if(result.ok===true&&typeof result.id==='string'&&result.id.trim()&&result.id.length<=128&&typeof result.receiptNumber==='string'&&result.receiptNumber.trim()&&result.receiptNumber.length<=128&&(result.replayed===undefined||typeof result.replayed==='boolean')&&(!serverReceiptIds.has(result.id)||serverReceiptIds.get(result.id)===sale.id)&&(!serverReceiptNumbers.has(receiptScope)||serverReceiptNumbers.get(receiptScope)===sale.id)){
      serverReceiptNumbers.set(receiptScope,sale.id);
      serverReceiptIds.set(result.id,sale.id);
      try{await ledger.acknowledge(sale.id,{id:result.id,receiptNumber:result.receiptNumber,replayed:!!result.replayed});acknowledged++;}
      catch(error){
       // A local storage failure must not discard confirmations for later sales.
       failed++;
       skipped.add(sale.id);
       try{await ledger.error(sale.id,'Bestätigung konnte lokal nicht gespeichert werden: '+(error.message||'Speicherfehler'));}catch{}
      }
     }else{
      failed++;
      skipped.add(sale.id);
      try{await ledger.error(sale.id,result?.ok===true?'Ungültige Serverbestätigung; Verkauf bleibt zur Prüfung offen.':result?.error||'Verkauf nicht bestätigt');}
      catch(error){
       // A failed local error annotation must not block other server results.
       // The unacknowledged sale remains in the durable retry queue.
      }
     }
    }
    // Do not resend rejected sales repeatedly during the same sync cycle.
    notifySafely();
    pending=await ledger.pending(Array.from(attempted));
    if(pending.length===0&&skipped.size)publish({state:'syncing',message:skipped.size+' Verkäufe benötigen eine Prüfung; übrige Übertragungen sind abgeschlossen.'});
   }
   let catalogError=null;
   if(force||!lastCatalog||now()-lastCatalog>6*3600000){
    try{
     const catalogResponse=await request('catalog',{});const snapshot=catalogResponse?.snapshot;
     if(!snapshot||typeof snapshot!=='object'||Array.isArray(snapshot)||typeof snapshot.id!=='string'||typeof snapshot.validUntil!=='string'||!Number.isFinite(Date.parse(snapshot.validUntil))||Date.parse(snapshot.validUntil)<=now())throw Error('Ungültiger Offline-Katalog');
     await ledger.catalog(snapshot);lastCatalog=now();
    }catch(error){catalogError=error;}
   }
   const remaining=await ledger.pendingCount();
   notifySafely();
   const message=remaining?acknowledged+' Verkäufe bestätigt. '+remaining+' Offline-Verkäufe sind weiterhin offen.'+(failed?' '+failed+' davon benötigen eine Prüfung.':''):'Alle gespeicherten Verkäufe übertragen.';
   publish({state:failed||remaining||catalogError?'warning':'success',message:catalogError?message+' Katalogaktualisierung fehlgeschlagen: '+(catalogError.message||'nicht verfügbar'):message,...(!failed&&!remaining&&!catalogError?{lastSuccess:new Date(now()).toISOString()}:{})});
  }catch(error){publish({state:'error',message:error.message||'Synchronisierung nicht verfügbar. Erneut versuchen.'});}
  return {...status};
 };
 return {status:()=>({...status}),sync(force=false){
  if(running)return running;
  running=run(force).finally(()=>{running=null;});return running;
 }};
}
