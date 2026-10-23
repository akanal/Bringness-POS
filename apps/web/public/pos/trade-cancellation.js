(()=>{
 const storageKey=id=>'bringness.trade.cancellation-draft.v1:'+id;
 window.bnMountCancellationDraft=async(host,receiptId,review)=>{
  const area=document.createElement('section');host.append(area);
  const status=document.createElement('p');status.setAttribute('role','status');status.textContent='Stornoentwurf wird geladen…';area.append(status);
  let busy=false;
  const clearPending=requestKey=>{const raw=localStorage.getItem(storageKey(receiptId));if(raw){try{if(JSON.parse(raw).requestKey===requestKey)localStorage.removeItem(storageKey(receiptId))}catch{}}};
  const validate=draft=>{
   if(draft?.status!=='draft_only'||draft.receiptId!==receiptId||draft.canCancel!==false||draft.review?.original?.id!==receiptId)throw Error('Gespeicherter Entwurf ist nicht eindeutig zugeordnet.');
  };
  const show=draft=>{
   validate(draft);
   const title=document.createElement('strong');title.textContent='Stornoentwurf gespeichert · '+draft.review.original.number;
   const reason=document.createElement('p');reason.textContent='Grund: '+draft.reason;
   const amount=document.createElement('p');amount.textContent='Gespeicherter Gegenbetrag: '+(draft.review.proposedReversalCents/100).toLocaleString('de-DE',{style:'currency',currency:'EUR'});
   const note=document.createElement('p');note.textContent='Entwurf, kein ausgestellter Stornobeleg. Es wurde kein Geld zurückgezahlt. Vor einer späteren Buchung ist erneut zu prüfen.';
   area.replaceChildren(title,reason,amount,note);
  };
  try{
   const {draft}=await api('/trade/invoices/'+encodeURIComponent(receiptId)+'/cancellation-draft');if(!area.isConnected)return;
   if(draft){show(draft);clearPending(draft.requestKey);return;}
   if(review.issues.length){status.textContent='Entwurf speichern ist erst nach Klärung der Vorprüfung möglich.';return;}
   let pending=null;const raw=localStorage.getItem(storageKey(receiptId));
   if(raw){pending=JSON.parse(raw);if(typeof pending.reason!=='string'||pending.reason.trim().length<3||pending.reason.length>500||/[\x00-\x1f\x7f]/.test(pending.reason)||!/^([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i.test(pending.requestKey||''))throw Error('Lokaler Entwurfsspeicher beschädigt. Gespeicherten Entwurf erneut öffnen; nicht neu absenden.');}
   const form=document.createElement('form'),label=document.createElement('label'),reason=document.createElement('textarea'),save=document.createElement('button');
   label.textContent='Stornogrund';reason.required=true;reason.minLength=3;reason.maxLength=500;reason.dataset.cancellationReason='';reason.value=pending?.reason||'';reason.readOnly=!!pending;label.append(reason);
   save.type='submit';save.dataset.cancellationSave='';save.textContent=pending?'Unklare Entwurfsspeicherung abgleichen':'Stornoentwurf mit Verwaltungs-PIN speichern';
   status.textContent=pending?'Eine Speicherung wurde unterbrochen. Derselbe Entwurf wird erneut abgefragt.':'Speichert nur einen Entwurf. Keine Stornobuchung und keine Auszahlung.';
   form.append(label,save);area.replaceChildren(form,status);
   form.onsubmit=async e=>{
    e.preventDefault();if(busy)return;
    busy=true;save.disabled=true;
    try{
     if(!await window.ensurePersonnelAccess?.())throw Error('Verwaltungsfreigabe erforderlich.');
     if(!area.isConnected)return;
     if(!pending){const text=reason.value.trim();if(text.length<3||text.length>500||/[\x00-\x1f\x7f]/.test(text))throw Error('Stornogrund mit 3 bis 500 Zeichen eingeben.');const command={requestKey:crypto.randomUUID(),reason:text};localStorage.setItem(storageKey(receiptId),JSON.stringify(command));pending=command;}
     // Persist before sending. Failed/ambiguous replies retain this exact body across reload.
     localStorage.setItem(storageKey(receiptId),JSON.stringify(pending));reason.readOnly=true;
     const result=await api('/trade/invoices/'+encodeURIComponent(receiptId)+'/cancellation-draft',{method:'POST',body:JSON.stringify(pending)});
     if(result.draft?.requestKey!==pending.requestKey)throw Error('Speicherbestätigung unvollständig. Dieselbe Speicherung abgleichen.');
     validate(result.draft);if(area.isConnected)show(result.draft);
     clearPending(pending.requestKey);
    }catch(e){if(area.isConnected){status.textContent=e.message;if(!status.isConnected)area.append(status);save.textContent=pending?'Dieselbe Entwurfsspeicherung abgleichen':'Stornoentwurf mit Verwaltungs-PIN speichern';}}
    finally{busy=false;save.disabled=false;}
   };
  }catch(e){if(area.isConnected)status.textContent=e instanceof SyntaxError?'Lokaler Entwurfsspeicher beschädigt. Gespeicherten Entwurf erneut öffnen; nicht neu absenden.':e.message;}
 };
})();
