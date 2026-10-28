const prefix='/api/v1/shop/documents',fail=code=>Object.assign(Error(code),{code});
export const documentMessages={UNAUTHORIZED:'Bitte mit deinem Inhaber- oder Administratorkonto anmelden.',FORBIDDEN:'Dieses Konto darf die Dokumente nicht öffnen.',DOCUMENT_STORAGE_UNAVAILABLE:'Der Dokumentenspeicher ist derzeit nicht verfügbar. Bitte später erneut versuchen.',INVALID_DOCUMENT:'Bitte eine PDF-, PNG- oder JPG-Datei bis 5 MB mit passendem Dateinamen wählen.',BODY_TOO_LARGE:'Die Datei ist größer als 5 MB.',DOCUMENT_CONFLICT:'Dieser Upload gehört bereits zu einer anderen Datei. Bitte die Dateiauswahl erneuern.',DOCUMENT_QUOTA:'Das Speicher- oder Uploadlimit dieses Kontos ist erreicht.',DOCUMENT_BUSY:'Der Speicher bearbeitet gerade andere Dateien. Bitte erneut versuchen.',DOCUMENT_NOT_FOUND:'Dieses Dokument wurde für dein Konto nicht gefunden.',DOCUMENT_UNCERTAIN:'Keine Bestätigung erhalten. Du kannst dieselbe Datei identisch erneut senden oder die Liste aktualisieren.',ACCOUNT_CHANGED:'Die Anmeldung hat sich geändert. Bitte die Dokumente erneut laden.',DOCUMENT_MISMATCH:'Die Datei konnte nicht zuverlässig geprüft werden. Es wurde kein Download gestartet.'};
export function createDocumentClient({window:w,fetcher=w.fetch.bind(w),onPrivacy=()=>{}}){
 const token=()=>{try{return w.localStorage.getItem('bringness-pos-token')||'';}catch{return '';}};const active=new Set();let epoch=0;
 function clear(){epoch++;for(const controller of active)controller.abort();active.clear();onPrivacy();}
 const storage=e=>{if(e.key===null||e.key==='bringness-pos-token')clear();};const visibility=()=>{if(w.document.visibilityState==='hidden')clear();};
 w.addEventListener('storage',storage);w.addEventListener('pagehide',clear);w.document.addEventListener('visibilitychange',visibility);
 async function request(path,{method='GET',headers={},body,publicStatus=false,binary=false}={}){
  const before=token(),current=epoch;if(!publicStatus&&!before)throw fail('UNAUTHORIZED');if(w.document.visibilityState==='hidden')throw fail('ACCOUNT_CHANGED');
  const controller=new w.AbortController();active.add(controller);const timer=w.setTimeout(()=>controller.abort(),45000);
  const check=()=>{if(current!==epoch||before!==token()||w.document.visibilityState==='hidden'){clear();throw fail('ACCOUNT_CHANGED');}};
  try{
   const response=await fetcher(prefix+path,{method,headers:{...headers,...(!publicStatus?{Authorization:'Bearer '+before}:{})},body,credentials:'omit',mode:'same-origin',cache:'no-store',redirect:'error',signal:controller.signal});check();
   if(!response.ok){let value;try{value=await response.json();}catch{}check();const code=Object.hasOwn(documentMessages,value?.code)?value.code:'DOCUMENT_STORAGE_UNAVAILABLE';if(code==='UNAUTHORIZED'||code==='FORBIDDEN')clear();throw fail(code);}
   const value=binary?{bytes:new Uint8Array(await response.arrayBuffer()),sha:response.headers.get('X-Document-Sha256')}:await response.json();check();return value;
  }catch(error){if(Object.hasOwn(documentMessages,error.code))throw error;if(current!==epoch||before!==token())throw fail('ACCOUNT_CHANGED');throw fail(method==='POST'?'DOCUMENT_UNCERTAIN':'DOCUMENT_STORAGE_UNAVAILABLE');}finally{w.clearTimeout(timer);active.delete(controller);}
 }
 return {request,clear,dispose(){clear();w.removeEventListener('storage',storage);w.removeEventListener('pagehide',clear);w.document.removeEventListener('visibilitychange',visibility);}};
}
