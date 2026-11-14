(()=>{
 let popup=null,channel='',bound='',sequence=0,ready=false,completed=null,connectionReport=null;const settingsKey='bringness.customer-display.enabled.v1:';
 const context=()=>{try{const rid=document.getElementById('restaurant')?.value,user=data.user?.id;return token&&localStorage.getItem('bringness-pos-token')===token&&user&&rid&&document.getElementById('workspace')?.classList.contains('show')?{rid,user,scope:user+':'+rid}:null}catch{return null}};
 const enabled=c=>{try{return !!c&&localStorage.getItem(settingsKey+c.scope)==='yes'}catch{return false}};
 const artworkKey='bringness.customer-display.artwork.v1:';
 const validArtwork=value=>typeof value==='string'&&value.length<=2200000&&/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(value);
 const artwork=c=>{try{const value=localStorage.getItem(artworkKey+c.scope);return validArtwork(value)?value:''}catch{return ''}};
 const idle=state=>({business:'',state,items:[],adjustments:[],totalCents:0});
 function retail(c){
  if(document.body.dataset.posView==='handel')return window.bnTradeCustomerDisplay?.(c.rid)||idle('unavailable');
  if(!cart.length)return idle('idle');
  completed=null;
  const subtotal=Math.round(cart.reduce((n,x)=>n+x.qty*x.price,0)*100),tools=window.bnRetailSales,extras=tools?.extras()||{},discount=extras.discount?subtotal-window.bnDiscountTotal(subtotal,extras.discount):0;
  const total=tools?tools.total(subtotal):subtotal;if(!Number.isSafeInteger(total))throw Error();
  const adjustments=[...(discount?[{name:'Rabatt',totalCents:-discount}]:[]),...(window.bnDepositBreakdown?.(c.rid,cart.map(x=>({productId:x.id,qty:x.qty})))||[]).map(x=>({name:x.label,totalCents:x.totalCents}))];
  if(window.bnDepositLocked?.(c.rid))throw Error();
  return {business:String(data.restaurants.find(r=>r.id===c.rid)?.name||'').slice(0,120),state:'cart',items:cart.map(x=>({name:String(x.name).slice(0,500),qty:x.qty,totalCents:Math.round(x.qty*x.price*100)})),adjustments,totalCents:total};
 }
 function send(snapshot){if(popup&&!popup.closed&&ready)popup.postMessage({type:'bringness:customer-display',channel,sequence:++sequence,snapshot},location.origin);}
 function disconnect(preserveReceipt=false){try{send(idle('idle'));popup?.close()}catch{}popup=null;ready=false;channel='';bound='';if(!preserveReceipt)completed=null;}
 function update(){const c=context();if(completed&&(!c||!enabled(c)||completed.scope!==c.scope||Date.now()>=completed.until||cart.length))completed=null;if(!popup)return;if(popup.closed){disconnect(true);return;}if(!c||c.scope!==bound||!enabled(c)){disconnect();return;}try{let snapshot=retail(c);if(snapshot.state==='cart')completed=null;else if(snapshot.state==='idle'&&completed?.scope===c.scope&&Date.now()<completed.until)snapshot={...snapshot,state:'paid',receiptNumber:completed.number,qrDataUrl:completed.qr||''};snapshot.business=String(data.restaurants.find(r=>r.id===c.rid)?.name||'').slice(0,120);if(snapshot.state==='idle')snapshot.artwork=artwork(c);send(snapshot)}catch{send(idle('unavailable'));}}
 // Only the validated checkout path calls this; receipt lookup is independent of payment completion.
 window.bnCustomerDisplayPaid=result=>{try{
  const c=context();if(!c||!enabled(c)||result?.status!=='paid'||result.restaurantId!==c.rid||typeof result.id!=='string'||typeof result.receiptNumber!=='string')return;
  if(completed?.orderId===result.id)return;
  const sale=completed={scope:c.scope,orderId:result.id,number:result.receiptNumber.slice(0,80),until:Date.now()+60000,qr:''};update();
  Promise.resolve().then(()=>api('/receipts/customer-display?orderId='+encodeURIComponent(result.id)+'&restaurantId='+encodeURIComponent(c.rid))).then(receipt=>{
   if(completed!==sale||context()?.scope!==sale.scope||receipt.receiptNumber!==sale.number||!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(receipt.qrDataUrl||'')||receipt.qrDataUrl.length>100000)return;
   sale.qr=receipt.qrDataUrl;update();
  }).catch(()=>{});
 }catch{}};
 window.addEventListener('message',event=>{if(event.origin!==location.origin||event.source!==popup||event.data?.type!=='bringness:customer-display-ready'||event.data.channel!==channel)return;ready=true;connectionReport?.();update();});
 window.addEventListener('pagehide',()=>disconnect());window.addEventListener('storage',e=>{if(e.key===null||e.key==='bringness-pos-token'||e.key?.startsWith(settingsKey)||e.key?.startsWith(artworkKey))update();});document.getElementById('restaurant')?.addEventListener('change',update);document.addEventListener('bringness:pos-view',update);document.addEventListener('bringness:cart-changed',update);document.addEventListener('visibilitychange',update);window.addEventListener('focus',update);setInterval(update,1500);
 window.bnRenderCustomerDisplaySettings=area=>{
  const c=context();if(!c)return;const card=document.createElement('section');card.className='modulecard';card.dataset.settingsGroup='devices';
  const title=document.createElement('h3');title.textContent='Kundendisplay';const label=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.id='customerDisplayEnabled';input.checked=enabled(c);label.append(input,document.createTextNode(' Kundendisplay für diese Kasse aktivieren'));
  const text=document.createElement('p');text.textContent='Artikel, Mengen, Rabatt, Pfand und Gesamtbetrag laufen ohne Bedienung mit. Die Auswahl bleibt für diesen Betrieb und dieses Browserprofil gespeichert. Beim Kassenstart das Anzeigefenster bei Bedarf öffnen und auf den zweiten Monitor ziehen; dort kann es über die Browsersteuerung im Vollbild laufen.';
  const open=document.createElement('button');open.type='button';open.id='customerDisplayOpen';open.textContent='Kundendisplay öffnen';open.disabled=false;
  const status=document.createElement('p');status.id='customerDisplayStatus';status.setAttribute('role','status');
  const artworkStatus=document.createElement('p');artworkStatus.id='customerDisplayArtworkStatus';artworkStatus.setAttribute('role','status');
  const copy=document.createElement('button');copy.type='button';copy.id='customerDisplayDiagnosticCopy';copy.textContent='Letzte Fehlerdiagnose kopieren';copy.hidden=true;
  const diagnosticText=document.createElement('textarea');diagnosticText.id='customerDisplayDiagnosticText';diagnosticText.readOnly=true;diagnosticText.hidden=true;diagnosticText.setAttribute('aria-label','Fehlerdiagnose zum Kopieren');
  let diagnostic=null;
  const report=(target,message,code='')=>{target.textContent=message+(code?' ['+code+']':'');if(code){diagnostic={code,time:new Date().toISOString(),appVersion:'customer-display-receipt60-20261114',online:navigator.onLine===true,displayEnabled:enabled(c),windowState:!popup?'not-open':popup.closed?'closed':ready?'connected':'waiting'};copy.hidden=false;diagnosticText.hidden=true;diagnosticText.value='';}};
  copy.onclick=async()=>{if(!diagnostic)return;if(context()?.scope!==c.scope){diagnostic=null;copy.hidden=true;diagnosticText.hidden=true;diagnosticText.value='';return;}const text=JSON.stringify(diagnostic,null,2);try{if(!navigator.clipboard?.writeText)throw Error();await navigator.clipboard.writeText(text);copy.textContent='Diagnose kopiert';}catch{diagnosticText.value=text;diagnosticText.hidden=false;diagnosticText.focus();diagnosticText.select();copy.textContent='Diagnose markieren und kopieren';}};

  const current=()=>context()?.scope===c.scope&&document.body.dataset.posView==='einstellungen'&&card.isConnected;
  input.onchange=async()=>{const wanted=input.checked;input.disabled=true;try{if(!current()||!await window.ensurePersonnelAccess?.()||!current())throw Error('Verwaltungsfreigabe und aktueller Betrieb erforderlich.');localStorage.setItem(settingsKey+c.scope,wanted?'yes':'no');input.checked=enabled(c);if(input.checked!==wanted)throw Error('Einstellung konnte nicht gespeichert werden.');open.disabled=false;if(!wanted)disconnect();report(status,wanted?'Kundendisplay aktiviert. Anzeigefenster bei Bedarf öffnen.':'Kundendisplay ausgeschaltet.');}catch(error){input.checked=enabled(c);open.disabled=false;report(status,error.message,'CD-ACTIVATION');}finally{input.disabled=false}};
  connectionReport=()=>{if(current())report(status,'Kundendisplay verbunden. Warenkorb und Quittung werden übertragen.');};
  open.onclick=()=>{
   if(!current()){report(status,'Bitte die Kundendisplay-Einstellungen für den aktuellen Betrieb erneut öffnen.','CD-CONTEXT');return;}
   if(!enabled(c)){report(status,'Bitte zuerst „Kundendisplay für diese Kasse aktivieren“ einschalten.','CD-DISABLED');return;}
   if(popup&&!popup.closed&&bound===c.scope){try{popup.focus();report(status,'Das Kundendisplay ist bereits geöffnet. Bitte auch die offenen Browser-Tabs prüfen.');update();return;}catch{disconnect(true);}}
   disconnect(completed?.scope===c.scope);
   try{channel=Array.from(crypto.getRandomValues(new Uint8Array(32)),x=>x.toString(16).padStart(2,'0')).join('');bound=c.scope;sequence=0;popup=window.open('/pos/customer-display.html#'+channel,'_blank');
    if(!popup){disconnect(true);report(status,'Der Browser hat das Fenster blockiert. Pop-ups für diese Kasse erlauben und erneut öffnen.','CD-POPUP-BLOCKED');return;}
    report(status,'Anzeigefenster geöffnet. Verbindung zur Anzeige wird geprüft …');
    const openedChannel=channel;setTimeout(()=>{if(current()&&channel===openedChannel&&!ready&&popup&&!popup.closed)report(status,'Das Fenster wurde geöffnet, aber die Anzeige hat die Verbindung noch nicht bestätigt. Bitte den geöffneten Tab prüfen.','CD-CONNECTION-TIMEOUT');},8000);
   }catch{report(status,'Das Kundendisplay konnte nicht geöffnet werden. Bitte erneut versuchen.','CD-OPEN-FAILED');}
  };
  const artworkGroup=document.createElement('fieldset');artworkGroup.id='customerDisplayArtworkGroup';const legend=document.createElement('legend');legend.textContent='Werbebild im Ruhezustand';artworkGroup.append(legend);
  const uploadLabel=document.createElement('label');uploadLabel.textContent='Werbebild auswählen';
  const upload=document.createElement('input');upload.type='file';upload.id='customerDisplayArtwork';upload.accept='image/png,image/jpeg,image/webp';uploadLabel.append(upload);
  const hint=document.createElement('p');hint.textContent='PNG, JPEG oder WebP, maximal 2 MB. Das Bild wird für diesen Betrieb in diesem Browser gespeichert. Dankestext und Quittungs-QR bleiben eine Minute sichtbar; der nächste Einkauf erscheint sofort.';
  const preview=document.createElement('img');preview.alt='Vorschau des Werbebildes';preview.style.maxWidth='100%';preview.style.maxHeight='180px';preview.hidden=!artwork(c);if(artwork(c))preview.src=artwork(c);
  const remove=document.createElement('button');remove.type='button';remove.id='customerDisplayArtworkRemove';remove.textContent='Werbebild entfernen';
  const refresh=()=>{const value=artwork(c);preview.hidden=!value;if(value)preview.src=value;else preview.removeAttribute('src');update();};
  let editing=false,artworkCode='CD-IMAGE-READ';
  upload.onchange=async()=>{if(editing)return;const file=upload.files?.[0];if(!file)return;editing=true;upload.disabled=remove.disabled=true;report(artworkStatus,'Bild wird geprüft und für die Anzeige verkleinert …');try{
   artworkCode='CD-IMAGE-FORMAT';if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>2000000)throw Error('Bitte PNG, JPEG oder WebP mit maximal 2 MB auswählen.');
   artworkCode='CD-ACCESS';if(!current()||!await window.ensurePersonnelAccess?.()||!current())throw Error('Verwaltungsfreigabe und aktueller Betrieb erforderlich.');
   artworkCode='CD-IMAGE-DECODE';const image=new Image(),url=URL.createObjectURL(file);try{await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(Error('Das Bild konnte nicht gelesen werden.'));image.src=url;});}finally{URL.revokeObjectURL(url);}
   if(!current()||!image.naturalWidth||!image.naturalHeight)throw Error('Bitte Einstellungen für den aktuellen Betrieb erneut öffnen.');
   // Canvas may fall back to PNG for an unsupported requested codec. Bound the
   // actual encoded result, not the original file size or requested MIME type.
   let ratio=Math.min(1,1920/image.naturalWidth,1080/image.naturalHeight),value='';const canvas=document.createElement('canvas');
   artworkCode='CD-IMAGE-SIZE';for(let attempt=0;attempt<5&&!value;attempt++){
    canvas.width=Math.max(1,Math.round(image.naturalWidth*ratio));canvas.height=Math.max(1,Math.round(image.naturalHeight*ratio));const ctx=canvas.getContext('2d');if(!ctx)throw Error('Bildverarbeitung ist in diesem Browser nicht verfügbar.');ctx.fillStyle='#ffffff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);
    for(const quality of [0.85,0.65,0.45]){const candidate=canvas.toDataURL('image/jpeg',quality);if(validArtwork(candidate)&&candidate.length<=1000000){value=candidate;break;}}
    ratio*=0.7;
   }
   if(!value)throw Error('Das Bild konnte nicht ausreichend verkleinert werden. Bitte ein anderes Bild verwenden.');
   artworkCode='CD-STORAGE';localStorage.setItem(artworkKey+c.scope,value);if(artwork(c)!==value)throw Error('Das Werbebild konnte nicht bestätigt gespeichert werden.');refresh();report(artworkStatus,'Werbebild gespeichert. Es erscheint im Ruhezustand.');
  }catch(error){report(artworkStatus,error.name==='QuotaExceededError'?'Nicht genügend Browserspeicher. Bitte ein kleineres Bild verwenden.':error.message,artworkCode);}finally{editing=false;upload.disabled=remove.disabled=false;upload.value='';}};
  remove.onclick=async()=>{if(editing)return;editing=true;upload.disabled=remove.disabled=true;try{if(!current()||!await window.ensurePersonnelAccess?.()||!current())throw Error('Verwaltungsfreigabe und aktueller Betrieb erforderlich.');localStorage.removeItem(artworkKey+c.scope);refresh();report(artworkStatus,'Werbebild entfernt. Im Ruhezustand erscheint Willkommen.');}catch(error){report(artworkStatus,error.message,'CD-IMAGE-REMOVE');}finally{editing=false;upload.disabled=remove.disabled=false;}};
  artworkGroup.append(uploadLabel,hint,preview,remove,artworkStatus);card.append(title,label,text,open,status,artworkGroup,copy,diagnosticText);area.append(card);
 };
})();
