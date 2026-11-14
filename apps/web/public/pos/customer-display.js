(()=>{
 let popup=null,channel='',bound='',sequence=0,ready=false,completed=null;const settingsKey='bringness.customer-display.enabled.v1:';
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
  const sale=completed={scope:c.scope,orderId:result.id,number:result.receiptNumber.slice(0,80),until:Date.now()+120000,qr:''};update();
  Promise.resolve().then(()=>api('/receipts/customer-display?orderId='+encodeURIComponent(result.id)+'&restaurantId='+encodeURIComponent(c.rid))).then(receipt=>{
   if(completed!==sale||context()?.scope!==sale.scope||receipt.receiptNumber!==sale.number||!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(receipt.qrDataUrl||'')||receipt.qrDataUrl.length>100000)return;
   sale.qr=receipt.qrDataUrl;update();
  }).catch(()=>{});
 }catch{}};
 window.addEventListener('message',event=>{if(event.origin!==location.origin||event.source!==popup||event.data?.type!=='bringness:customer-display-ready'||event.data.channel!==channel)return;ready=true;update();});
 window.addEventListener('pagehide',()=>disconnect());window.addEventListener('storage',e=>{if(e.key===null||e.key==='bringness-pos-token'||e.key?.startsWith(settingsKey)||e.key?.startsWith(artworkKey))update();});document.getElementById('restaurant')?.addEventListener('change',update);document.addEventListener('bringness:pos-view',update);document.addEventListener('bringness:cart-changed',update);document.addEventListener('visibilitychange',update);window.addEventListener('focus',update);setInterval(update,1500);
 window.bnRenderCustomerDisplaySettings=area=>{
  const c=context();if(!c)return;const card=document.createElement('section');card.className='modulecard';card.dataset.settingsGroup='devices';
  const title=document.createElement('h3');title.textContent='Kundendisplay';const label=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.id='customerDisplayEnabled';input.checked=enabled(c);label.append(input,document.createTextNode(' Kundendisplay für diese Kasse aktivieren'));
  const text=document.createElement('p');text.textContent='Artikel, Mengen, Rabatt, Pfand und Gesamtbetrag laufen ohne Bedienung mit. Die Auswahl bleibt für diesen Betrieb und dieses Browserprofil gespeichert. Beim Kassenstart das Anzeigefenster bei Bedarf öffnen und auf den zweiten Monitor ziehen; dort kann es über die Browsersteuerung im Vollbild laufen.';
  const open=document.createElement('button');open.type='button';open.id='customerDisplayOpen';open.textContent='Kundendisplay öffnen';open.disabled=false;
  const status=document.createElement('p');status.setAttribute('role','status');
  const current=()=>context()?.scope===c.scope&&document.body.dataset.posView==='einstellungen'&&card.isConnected;
  input.onchange=async()=>{const wanted=input.checked;input.disabled=true;try{if(!current()||!await window.ensurePersonnelAccess?.()||!current())throw Error('Verwaltungsfreigabe und aktueller Betrieb erforderlich.');localStorage.setItem(settingsKey+c.scope,wanted?'yes':'no');input.checked=enabled(c);if(input.checked!==wanted)throw Error('Einstellung konnte nicht gespeichert werden.');open.disabled=false;if(!wanted)disconnect();status.textContent=wanted?'Kundendisplay aktiviert. Anzeigefenster bei Bedarf öffnen.':'Kundendisplay ausgeschaltet.';}catch(error){input.checked=enabled(c);open.disabled=false;status.textContent=error.message}finally{input.disabled=false}};
  open.onclick=()=>{if(!current()||!enabled(c)){status.textContent='Bitte zuerst „Kundendisplay für diese Kasse aktivieren“ einschalten. Bei blockiertem Fenster Pop-ups in den Browsereinstellungen erlauben.';return;}if(popup&&!popup.closed&&bound===c.scope){try{popup.focus();status.textContent='Das Kundendisplay ist bereits geöffnet. Bitte auch die offenen Browser-Tabs prüfen.';update();return;}catch{disconnect(true);}}disconnect(completed?.scope===c.scope);try{channel=Array.from(crypto.getRandomValues(new Uint8Array(32)),x=>x.toString(16).padStart(2,'0')).join('');bound=c.scope;sequence=0;popup=window.open('/pos/customer-display.html#'+channel,'_blank');if(!popup){disconnect();throw Error('Der Browser hat das Fenster blockiert. Pop-ups für diese Kasse erlauben und erneut öffnen.');}status.textContent='Anzeigefenster geöffnet. Auf den Kundenmonitor ziehen; die Artikel erscheinen beim Verkauf.';}catch(error){status.textContent=error.message}};
  const uploadLabel=document.createElement('label');uploadLabel.textContent='Werbebild im Ruhezustand';
  const upload=document.createElement('input');upload.type='file';upload.id='customerDisplayArtwork';upload.accept='image/png,image/jpeg,image/webp';uploadLabel.append(upload);
  const hint=document.createElement('p');hint.textContent='PNG, JPEG oder WebP, maximal 2 MB. Das Bild wird für diesen Betrieb in diesem Browser gespeichert. Dankestext und Quittungs-QR bleiben zwei Minuten sichtbar; der nächste Einkauf erscheint sofort.';
  const preview=document.createElement('img');preview.alt='Vorschau des Werbebildes';preview.style.maxWidth='100%';preview.style.maxHeight='180px';preview.hidden=!artwork(c);if(artwork(c))preview.src=artwork(c);
  const remove=document.createElement('button');remove.type='button';remove.id='customerDisplayArtworkRemove';remove.textContent='Werbebild entfernen';
  const refresh=()=>{const value=artwork(c);preview.hidden=!value;if(value)preview.src=value;else preview.removeAttribute('src');update();};
  let editing=false;
  upload.onchange=async()=>{if(editing)return;const file=upload.files?.[0];if(!file)return;editing=true;upload.disabled=remove.disabled=true;try{
   if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>2000000)throw Error('Bitte PNG, JPEG oder WebP mit maximal 2 MB auswählen.');
   if(!current()||!await window.ensurePersonnelAccess?.()||!current())throw Error('Verwaltungsfreigabe und aktueller Betrieb erforderlich.');
   const image=new Image(),url=URL.createObjectURL(file);try{await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(Error('Das Bild konnte nicht gelesen werden.'));image.src=url;});}finally{URL.revokeObjectURL(url);}
   if(!current()||!image.naturalWidth||!image.naturalHeight)throw Error('Bitte Einstellungen für den aktuellen Betrieb erneut öffnen.');
   const ratio=Math.min(1,1920/image.naturalWidth,1080/image.naturalHeight),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.naturalWidth*ratio));canvas.height=Math.max(1,Math.round(image.naturalHeight*ratio));canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);const value=canvas.toDataURL('image/webp',0.85);
   if(!validArtwork(value))throw Error('Das Bild ist nach der Verarbeitung zu groß. Bitte ein kleineres Bild verwenden.');
   localStorage.setItem(artworkKey+c.scope,value);refresh();status.textContent='Werbebild gespeichert. Es erscheint im Ruhezustand.';
  }catch(error){status.textContent=error.name==='QuotaExceededError'?'Nicht genügend Browserspeicher. Bitte ein kleineres Bild verwenden.':error.message;}finally{editing=false;upload.disabled=remove.disabled=false;upload.value='';}};
  remove.onclick=async()=>{if(editing)return;editing=true;upload.disabled=remove.disabled=true;try{if(!current()||!await window.ensurePersonnelAccess?.()||!current())throw Error('Verwaltungsfreigabe und aktueller Betrieb erforderlich.');localStorage.removeItem(artworkKey+c.scope);refresh();status.textContent='Werbebild entfernt. Im Ruhezustand erscheint Willkommen.';}catch(error){status.textContent=error.message;}finally{editing=false;upload.disabled=remove.disabled=false;}};
  card.append(title,label,text,open,uploadLabel,hint,preview,remove,status);area.append(card);
 };
})();
