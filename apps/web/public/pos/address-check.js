(()=>{
 let serial=0;
 window.bnMountAddressCheck=(host,{inputs,read,open})=>{
  const note=document.createElement('div');note.className='address-check';note.id='address-check-'+(++serial);note.setAttribute('role','status');note.setAttribute('aria-live','polite');note.hidden=true;host.append(note);
  const keys=['street','postalCode','city','country'];let version=0,timer;
  const clear=()=>{version++;clearTimeout(timer);note.hidden=true;note.replaceChildren();for(const k of keys){inputs[k]?.removeAttribute('aria-invalid');inputs[k]?.removeAttribute('aria-describedby');}};
  const check=async({complete=false}={})=>{
   clear();const request=version,values=read(),address=Object.fromEntries(keys.map(k=>[k,values[k]||'']));
   if(!complete&&!keys.some(k=>address[k]?.trim()))return;
   const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),4000);
   try{
    const result=await api('/address-check',{method:'POST',body:JSON.stringify({address,complete}),signal:controller.signal});
    if(request!==version||!host.isConnected||keys.some(k=>(read()[k]||'')!==address[k]))return;
    const issues=result.issues||[];note.classList.toggle('has-errors',issues.length>0);
    for(const item of issues){const message=document.createElement('p');message.textContent=item.message;note.append(message);for(const k of item.fields||[])if(inputs[k]){inputs[k].setAttribute('aria-invalid','true');inputs[k].setAttribute('aria-describedby',note.id);}}
    const info=document.createElement('small');info.textContent=result.message||'Adresse nicht geprüft.';note.append(info);
    if(result.sourceUrl==='https://www.geonames.org/'){const source=document.createElement('a');source.href=result.sourceUrl;source.textContent='PLZ-Daten: GeoNames';source.target='_blank';source.rel='noopener noreferrer';note.append(source);}
    note.hidden=false;if(complete&&issues.length)open?.();return result;
   }catch{if(request!==version||!host.isConnected)return;note.classList.remove('has-errors');note.textContent='Adressprüfung derzeit nicht verfügbar. Adresse bitte selbst prüfen.';note.hidden=false;}finally{clearTimeout(timeout);}
  };
  for(const k of keys){inputs[k]?.addEventListener('input',clear);inputs[k]?.addEventListener('change',()=>{clear();timer=setTimeout(()=>check(),250);});inputs[k]?.addEventListener('blur',()=>{clearTimeout(timer);check();});}
  return {check,clear};
 };
})();
