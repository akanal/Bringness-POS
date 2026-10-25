// Short-lived in-memory download URLs only. No local/session storage or navigation.
export function createPreviewPdfDownload({window,document}){
 const pending=new Map(),clear=()=>{for(const [url,timer]of pending){window.clearTimeout(timer);window.URL.revokeObjectURL(url);}pending.clear();};
 return {clear,save({bytes,filename}){
  if(!(bytes instanceof Uint8Array)||bytes.length<100||bytes.length>2097152||!/^Bringness-Vorschau-BN-\d{4}-\d{6,20}\.pdf$/.test(filename)||typeof window.URL.createObjectURL!=='function')throw Object.assign(Error('PDF_DOWNLOAD_UNAVAILABLE'),{code:'PDF_DOWNLOAD_UNAVAILABLE'});
  const url=window.URL.createObjectURL(new window.Blob([bytes],{type:'application/pdf'})),anchor=document.createElement('a');anchor.href=url;anchor.download=filename;anchor.hidden=true;
  try{document.body.append(anchor);anchor.click();}catch(e){window.URL.revokeObjectURL(url);throw e;}finally{anchor.remove();}
  pending.set(url,window.setTimeout(()=>{window.URL.revokeObjectURL(url);pending.delete(url);},30000));
 }};
}
