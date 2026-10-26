// Sequential revision-checked commands use the existing idempotent account client.
// Stop at the first uncertain outcome; the original pending command remains recoverable.
export async function archiveSelected(rows,{expectedBinding,identity,send,current,requestId,onProgress=()=>{}}){
 if(!Array.isArray(rows)||!rows.length||rows.length>200||new Set(rows.map(r=>r.id)).size!==rows.length||rows.some(r=>r.state!=='draft'||!Number.isSafeInteger(r.revision)||r.revision<1))throw {code:'INVALID_REQUEST'};
 let completed=0;
 for(const row of rows){
  if(!current()||await identity()!==expectedBinding||!current())throw {code:'ACCOUNT_CHANGED',completed};
  try{await send({id:row.id,expectedRevision:row.revision,requestId:requestId(),action:'archive'});}catch(error){throw Object.assign(error instanceof Error?error:{...error},{completed});}
  completed++;if(!current())throw {code:'ACCOUNT_CHANGED',completed};onProgress(row,completed);
 }
 return completed;
}
