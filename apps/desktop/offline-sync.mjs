// Keep synchronization single-flight and acknowledge only accepted sales.
export function createOfflineSync({ledger,connect,notify=()=>{},now=Date.now}) {
 let running=null,lastCatalog=0;
 let status={state:'idle',message:'Noch keine Synchronisierung',lastSuccess:null};
 const publish=(next)=>{status={...status,...next};notify();};
 const run=async(force)=>{
  publish({state:'syncing',message:'Verkäufe werden übertragen …'});
  try {
   const request=await connect();
   if(!request){publish({state:'login',message:'Online-Kasse öffnen und anmelden.'});return {...status};}
   // Drain all batches, including more than 100 pending sales, before refreshing.
   const skipped=new Set();
   let pending=await ledger.pending();
   let failed=0;
   while(pending.length){
    const batch=pending.slice(0,20);
    const response=await request('batch',{sales:batch.map(s=>s.request)});
    if(!Array.isArray(response?.results)||response.results.length!==batch.length)throw Error('Unvollständige Antwort der Offline-Synchronisierung');
    if(response.results.some((result,index)=>result?.offlineId!==batch[index].id))throw Error('Offline-Antwort enthält unerwartete Verkaufskennungen');
    for(let index=0;index<batch.length;index++){
     const sale=batch[index],result=response.results[index];
     if(result?.offlineId!==sale.id)throw Error('Offline-Antwort stimmt nicht mit der Verkaufskennung überein');
     if(result.ok===true&&result.id&&result.receiptNumber){
      await ledger.acknowledge(sale.id,{id:result.id,receiptNumber:result.receiptNumber,replayed:!!result.replayed});
     }else{
      failed++;
      skipped.add(sale.id);
      await ledger.error(sale.id,result?.error||'Verkauf nicht bestätigt');
     }
    }
    // Do not resend rejected sales repeatedly during the same sync cycle.
    pending=await ledger.pending(Array.from(skipped));
   }
   if(force||!lastCatalog||now()-lastCatalog>6*3600000){
    const {snapshot}=await request('catalog',{});await ledger.catalog(snapshot);lastCatalog=now();
   }
   publish({state:failed?'warning':'success',message:failed?failed+' Offline-Verkäufe benötigen eine Prüfung. Andere Verkäufe wurden übertragen.':'Alle gespeicherten Verkäufe übertragen.',lastSuccess:new Date(now()).toISOString()});
  }catch(error){publish({state:'error',message:error.message||'Synchronisierung nicht verfügbar. Erneut versuchen.'});}
  return {...status};
 };
 return {status:()=>({...status}),sync(force=false){
  if(running)return running;
  running=run(force).finally(()=>{running=null;});return running;
 }};
}
