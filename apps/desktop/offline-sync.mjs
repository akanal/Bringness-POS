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
   let pending=await ledger.pending();
   while(pending.length){
    for(const sale of pending){
     try{const receipt=await request('sales',{sale:sale.request});await ledger.acknowledge(sale.id,receipt);}
     catch(error){await ledger.error(sale.id,error.message);throw error;}
    }
    pending=await ledger.pending();
   }
   if(force||!lastCatalog||now()-lastCatalog>6*3600000){
    const {snapshot}=await request('catalog',{});await ledger.catalog(snapshot);lastCatalog=now();
   }
   publish({state:'success',message:'Alle gespeicherten Verkäufe übertragen.',lastSuccess:new Date(now()).toISOString()});
  }catch(error){publish({state:'error',message:error.message||'Synchronisierung nicht verfügbar. Erneut versuchen.'});}
  return {...status};
 };
 return {status:()=>({...status}),sync(force=false){
  if(running)return running;
  running=run(force).finally(()=>{running=null;});return running;
 }};
}
