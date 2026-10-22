(()=>{
 let lines=[],tiers=[],busy=false;
 const money=c=>(c/100).toLocaleString('de-DE',{style:'currency',currency:'EUR'});
 const price=(id,qty)=>tiers.filter(t=>t.product_id===id&&t.min_qty<=qty).sort((a,b)=>b.min_qty-a.min_qty)[0]?.price_cents;
 const key=rid=>'bringness.trade.pending.v1:'+rid;
 const download=async(id)=>{const r=await fetch('/api/v1/receipts/'+id+'/invoice',{headers:{authorization:'Bearer '+token}});if(!r.ok)throw Error((await r.json()).error);const url=URL.createObjectURL(await r.blob()),a=document.createElement('a');a.href=url;a.download='Rechnung.pdf';a.click();setTimeout(()=>URL.revokeObjectURL(url),10000)};
 async function openInvoice(id,number){
  const r=await fetch('/api/v1/receipts/'+id+'/invoice',{headers:{authorization:'Bearer '+token}});if(!r.ok)throw Error('Gespeicherte Rechnung konnte nicht geöffnet werden.');
  const url=URL.createObjectURL(await r.blob()),dialog=document.createElement('dialog');dialog.className='trade-issued-invoice';
  const title=document.createElement('strong');title.textContent='Rechnung '+number+' · gespeichert';const close=document.createElement('button');close.textContent='Zurück zum Verkauf';close.onclick=()=>dialog.close();
  const link=document.createElement('a');link.href=url;link.download='Rechnung-'+number+'.pdf';link.textContent='PDF herunterladen';const frame=document.createElement('iframe');frame.title='Gespeicherte Rechnung '+number;frame.src=url;
  dialog.append(title,close,link,frame);dialog.addEventListener('close',()=>{URL.revokeObjectURL(url);dialog.remove()},{once:true});document.getElementById('moduleBody').append(dialog);dialog.showModal();
 }
 const navigation=enabled=>document.querySelectorAll('[data-view="handel"]').forEach(b=>{b.hidden=!enabled;b.style.display=enabled?'':'none'});
 let navigationRequest=0;
 window.refreshTradeNavigation=async()=>{const request=++navigationRequest,rid=$('restaurant')?.value;navigation(false);if(!rid)return;try{const s=await api('/trade/settings?restaurantId='+encodeURIComponent(rid));if(request===navigationRequest&&$('restaurant').value===rid)navigation(s.enabled===true)}catch{}};
 window.renderTradeSettings=async rid=>{
  const host=$('moduleBody'),s=await api('/trade/settings?restaurantId='+encodeURIComponent(rid));if($('restaurant').value!==rid)return;
  const card=document.createElement('section');card.className='modulecard';card.innerHTML='<h3>Händleroption · kostenlos</h3><p>Zusätzlich zur normalen Kasse: Händlerpreise, Mengenstaffeln und große Mengen. Pfand und Leergut sind für beide Betriebsarten vorgesehen; ihre Umsetzung ist noch offen. Rabatte und geparkte Bons bleiben unabhängig nutzbar.</p><label><input type="checkbox" id="tradeEnabled"> Händler unter Mehr anzeigen</label><button type="button" id="tradeToggleSave">Mit Verwaltungs-PIN speichern</button><p role="status" id="tradeToggleStatus"></p><small>Ausschalten erhält Preise, geparkte Bons und Rechnungen. Neue Händlerverkäufe sind dann gesperrt. Zum Fortsetzen eines offenen Händlerbons die Option wieder einschalten. Vorhandene Rechnungen bleiben unter Belege zugänglich.</small>';
  host.prepend(card);const input=card.querySelector('input'),button=card.querySelector('button'),status=card.querySelector('[role="status"]');input.checked=s.enabled===true;navigation(input.checked);
  button.onclick=async()=>{button.disabled=true;try{if(!await window.ensurePersonnelAccess?.())return;const saved=await api('/trade/settings',{method:'PUT',body:JSON.stringify({restaurantId:rid,enabled:input.checked})});if($('restaurant').value===rid)navigation(saved.enabled===true);input.checked=saved.enabled===true;status.textContent='Händleroption '+(saved.enabled?'eingeschaltet.':'ausgeschaltet.')}catch(e){status.textContent=e.message}finally{button.disabled=false}};
 };
 window.renderTradeModule=async()=>{
  const rid=$('restaurant').value,host=$('moduleBody');lines=[];
  const setting=await api('/trade/settings?restaurantId='+encodeURIComponent(rid));
  if(!setting.enabled&&!localStorage.getItem(key(rid))){host.textContent='Händleroption ausgeschaltet. In den geschützten Einstellungen kostenlos aktivieren. Rechnungen bleiben unter Belege verfügbar.';return;}
  const result=await api('/trade/prices?restaurantId='+encodeURIComponent(rid));tiers=result.tiers;
  const products=data.products.filter(p=>p.restaurantId===rid);
  host.innerHTML='<div class="trade-layout"><section class="trade-panel"><h3>Produkte</h3><label>Artikel suchen<input id="tradeSearch" type="search" placeholder="Artikelname"></label><div id="tradeProducts"></div><details><summary>Händlerpreise verwalten</summary><label>Artikel<select id="tradePriceProduct">'+products.map(p=>'<option value="'+esc(p.id)+'">'+esc(p.name)+'</option>').join('')+'</select></label><div id="tradeTiers" class="trade-tiers" aria-label="Preisstaffeln"></div><button type="button" id="tradeAddTier">+ Staffel hinzufügen</button><button type="button" id="tradeSavePrices">Speichern</button><small>Mindestmenge, Euro und Cent getrennt eingeben. Maximal 20 Staffeln. Zum Löschen alle Staffeln entfernen und speichern.</small></details></section><section class="trade-panel"><h3>Verkauf</h3><div id="tradeLines"></div><div class="trade-total"><span>Brutto</span><strong id="tradeTotal">0,00 €</strong></div><details class="trade-recipient"><summary>Empfänger</summary><div class="trade-address">'+[['name','Firma / Empfänger'],['street','Straße und Hausnummer'],['postalCode','Postleitzahl'],['city','Ort'],['country','Land'],['vatId','USt-IdNr. (optional)'],['taxNumber','Steuernummer (optional)']].map(([id,label])=>'<label>'+label+'<input id="trade-'+id+'" maxlength="'+(id==='postalCode'?20:id==='taxNumber'?80:id==='vatId'?40:id==='country'?80:id==='city'?100:160)+'" '+(id==='country'?'value="Deutschland"':'')+'></label>').join('')+'</div></details><p>Barverkauf: Erst nach tatsächlich erhaltener Zahlung bestätigen. Karten- und Rechnungskauf werden hier nicht gebucht.</p><button class="primary" id="tradePay">Barzahlung erhalten</button><button id="tradeResume" hidden>Unterbrochene Zahlung abgleichen</button><p id="tradeStatus" class="trade-status" role="status"></p><div id="tradeDocuments"></div></section></div>';
  if(!setting.enabled){const notice=document.createElement('p');notice.textContent='Händleroption ausgeschaltet: Nur die gespeicherte Zahlung abgleichen. Neue Verkäufe erst nach Aktivierung in den Einstellungen.';host.prepend(notice);}
  let pending=null,storageOK=true,addressCheck=null,savingPrices=false;
  try{const raw=localStorage.getItem(key(rid));if(raw){pending=JSON.parse(raw);if(!pending||pending.restaurantId!==rid||pending.salesMode!=='trade'||!Array.isArray(pending.items)||typeof pending.requestKey!=='string')throw Error('invalid');}}catch{storageOK=false;$('tradeStatus').textContent='Zahlungsspeicher nicht verfügbar oder beschädigt. Bitte Belege prüfen; keine neue Zahlung möglich.'}
  if(pending){lines=pending.items.map(i=>({id:i.productId,qty:i.qty,name:products.find(p=>p.id===i.productId)?.name||'Gespeicherter Artikel'}));for(const [k,v]of Object.entries(pending.recipient||{})){const el=$('trade-'+k);if(el)el.value=v;}}
  const status=text=>{if($('tradeStatus'))$('tradeStatus').textContent=text};
  let tools=null;
  function draw(){
   $('tradeLines').innerHTML=lines.map(l=>'<div class="trade-line"><span>'+esc(l.name)+'<small>'+money(price(l.id,l.qty)||0)+' pro Stück brutto</small></span><input data-qty="'+l.id+'" aria-label="Menge '+esc(l.name)+'" type="number" min="1" max="999999" step="1" value="'+l.qty+'"><strong>'+money((price(l.id,l.qty)||0)*l.qty)+'</strong><button data-remove="'+l.id+'" aria-label="Entfernen">×</button></div>').join('')||'<p>Artikel mit Händlerpreis auswählen.</p>';
   const total=lines.reduce((s,l)=>s+(price(l.id,l.qty)||0)*l.qty,0);try{$('tradeTotal').textContent=money(tools?tools.total(total):total)}catch{$('tradeTotal').textContent='Rabatt prüfen'}tools?.refresh();
   lockTierEditor();
   $('tradePay').disabled=!!window.bnDepositLocked?.(rid)||!setting.enabled||busy||savingPrices||!!pending||!storageOK||!lines.length||lines.some(l=>!price(l.id,l.qty))||total>2147483647;
   $('tradeResume').hidden=!pending;$('tradeResume').disabled=busy;
   host.querySelectorAll('[data-qty]').forEach(el=>{el.disabled=busy||savingPrices||!!pending;el.onchange=()=>{const l=lines.find(l=>l.id===el.dataset.qty),n=Number(el.value);if(Number.isSafeInteger(n)&&n>=1&&n<=999999)l.qty=n;draw()}});
   host.querySelectorAll('[data-remove]').forEach(el=>{el.disabled=busy||savingPrices||!!pending;el.onclick=()=>{lines=lines.filter(l=>l.id!==el.dataset.remove);draw()}});
  }
  function catalog(){const search=$('tradeSearch').value.toLocaleLowerCase();$('tradeProducts').innerHTML=products.filter(p=>p.name.toLocaleLowerCase().includes(search)).map(p=>{const list=tiers.filter(t=>t.product_id===p.id);return '<div class="trade-product"><span>'+esc(p.name)+'<small>'+esc(list.map(t=>'ab '+t.min_qty+': '+money(t.price_cents)).join(' · ')||'Kein Händlerpreis hinterlegt')+'</small></span><input data-addqty="'+p.id+'" aria-label="Hinzufügen Menge '+esc(p.name)+'" type="number" min="1" max="999999" step="1" value="'+(list[0]?.min_qty||1)+'"><button data-add="'+p.id+'" '+'>'+(!list.length?'Preis festlegen':'Hinzufügen')+'</button></div>'}).join('');host.querySelectorAll('[data-add]').forEach(b=>b.onclick=()=>{if(busy||pending||savingPrices)return;const p=products.find(p=>p.id===b.dataset.add);if(!tiers.some(t=>t.product_id===p.id)){$('tradePriceProduct').value=p.id;loadTiers();$('tradeTiers').closest('details').open=true;$('tradeTiers').querySelector('input')?.focus();status('Für diesen Artikel zuerst einen Händlerpreis mit Verwaltungs-PIN speichern.');return;}const n=Number(host.querySelector('[data-addqty="'+p.id+'"]').value),existing=lines.find(l=>l.id===p.id),qty=n+(existing?.qty||0);if(!Number.isSafeInteger(n)||n<1||qty>999999||!price(p.id,qty))return status('Gültige Menge mit hinterlegtem Händlerpreis wählen.');if(existing)existing.qty=qty;else if(lines.length<100)lines.push({id:p.id,name:p.name,qty});draw()})}
  const tierEditor=$('tradeTiers');
  function lockTierEditor(){
   const locked=busy||!!pending||savingPrices;
   tierEditor.querySelectorAll('input,button').forEach(el=>el.disabled=locked);
   $('tradePriceProduct').disabled=locked;$('tradeSavePrices').disabled=locked||!products.length;
   $('tradeAddTier').disabled=locked||!products.length||tierEditor.children.length>=20;
  }
  function addTier(tier){
   if(tierEditor.children.length>=20)return;
   const row=document.createElement('div');row.className='trade-tier-row';
   row.innerHTML='<label>Mindestmenge<input data-tier-qty type="text" inputmode="numeric" maxlength="6" autocomplete="off"></label><fieldset class="trade-tier-price"><legend>Bruttopreis EUR</legend><label>Euro<input data-tier-euro type="text" inputmode="numeric" maxlength="8" autocomplete="off" placeholder="0"></label><label>Cent<input data-tier-cent type="text" inputmode="numeric" maxlength="2" autocomplete="off" placeholder="00"></label></fieldset><button type="button" data-tier-remove aria-label="Staffel entfernen">×</button>';
   row.querySelector('[data-tier-qty]').value=tier?.min_qty??(tierEditor.children.length?'':1);
   row.querySelector('[data-tier-euro]').value=tier?Math.floor(tier.price_cents/100):'';
   row.querySelector('[data-tier-cent]').value=tier?String(tier.price_cents%100).padStart(2,'0'):'00';
   row.querySelectorAll('input').forEach(input=>{input.onfocus=()=>input.select();input.oninput=()=>input.removeAttribute('aria-invalid');});
   row.querySelector('[data-tier-remove]').onclick=()=>{if(busy||pending||savingPrices)return;row.remove();lockTierEditor();};
   tierEditor.append(row);lockTierEditor();return row;
  }
  function loadTiers(){
   tierEditor.replaceChildren();const saved=tiers.filter(t=>t.product_id===$('tradePriceProduct').value).sort((a,b)=>a.min_qty-b.min_qty);
   saved.forEach(addTier);if(!saved.length&&products.length)addTier();lockTierEditor();
  }
  $('tradeAddTier').onclick=()=>{if(busy||pending||savingPrices)return;addTier()?.querySelector('input').focus();};
  $('tradePriceProduct').onchange=loadTiers;loadTiers();$('tradeSearch').oninput=catalog;
  $('tradeSavePrices').onclick=async()=>{
   if(busy||pending||savingPrices)return status('Zuerst die laufende Zahlung oder Speicherung abschließen.');
   try{
    const seen=new Set(),invalid=(input,message)=>{input.setAttribute('aria-invalid','true');input.focus();throw Error(message);};
    const parsed=[...tierEditor.children].map(row=>{
     const qty=row.querySelector('[data-tier-qty]'),euro=row.querySelector('[data-tier-euro]'),cent=row.querySelector('[data-tier-cent]');
     if(!/^\d+$/.test(qty.value.trim())||Number(qty.value)<1||Number(qty.value)>999999)invalid(qty,'Mindestmenge: ganze Zahl zwischen 1 und 999999 eingeben.');
     const minQty=Number(qty.value);if(seen.has(minQty))invalid(qty,'Jede Mindestmenge nur einmal angeben.');seen.add(minQty);
     if(!/^\d+$/.test(euro.value.trim()))invalid(euro,'Euro als ganze Zahl eingeben; Cent stehen im eigenen Feld.');
     if(!/^\d{0,2}$/.test(cent.value.trim()))invalid(cent,'Cent: Zahl zwischen 0 und 99 eingeben.');
     const priceCents=Number(euro.value)*100+Number(cent.value||0);
     if(!Number.isSafeInteger(priceCents)||priceCents<1||priceCents>2147483647)invalid(euro,'Bruttopreis zwischen 0 Euro 01 Cent und 21474836 Euro 47 Cent eingeben.');
     return {minQty,priceCents};
    });
    const productId=$('tradePriceProduct').value;savingPrices=true;draw();
    await api('/trade/prices',{method:'PUT',body:JSON.stringify({productId,tiers:parsed})});
    const updated=await api('/trade/prices?restaurantId='+encodeURIComponent(rid));
    if(!tierEditor.isConnected||$('tradeTiers')!==tierEditor||$('restaurant').value!==rid)return;
    tiers=updated.tiers;loadTiers();catalog();draw();status('Händlerpreise gespeichert.');
   }catch(e){status(e.message)}finally{savingPrices=false;if(tierEditor.isConnected&&$('tradeTiers')===tierEditor)draw();}
  };
  async function pay(){if(busy||savingPrices||!storageOK)return;try{
   if(!pending){if($('tradePay').disabled)return;addressCheck?.check({complete:true});const recipient=Object.fromEntries(['name','street','postalCode','city','country','vatId','taxNumber','email','phone'].map(k=>[k,($('trade-'+k)?.value||'').trim()]));if(['name','street','postalCode','city','country'].some(k=>!recipient[k])){host.querySelector('.trade-recipient').open=true;throw Error('Vollständigen Rechnungsempfänger eingeben.');}pending={requestKey:crypto.randomUUID(),restaurantId:rid,salesMode:'trade',recipient,...(tools?.extras()||{}),items:lines.map(l=>({productId:l.id,qty:l.qty})),payments:[{method:'cash',amountCents:tools?tools.total(lines.reduce((s,l)=>s+price(l.id,l.qty)*l.qty,0)):lines.reduce((s,l)=>s+price(l.id,l.qty)*l.qty,0)}]};}
   localStorage.setItem(key(rid),JSON.stringify(pending));busy=true;draw();status('Barverkauf wird sicher abgeglichen …');
   const result=await api('/orders/checkout',{method:'POST',body:JSON.stringify(pending)});
   if(result.requestKey!==pending.requestKey||result.restaurantId!==rid||result.status!=='paid'||result.totalCents!==pending.payments.reduce((s,p)=>s+p.amountCents,0)||typeof result.receiptNumber!=='string'||!/^[-a-f0-9]{36}$/i.test(result.receiptId||''))throw Error('Zahlungsbestätigung nicht eindeutig. Ursprünglichen Verkauf abgleichen.');
   // Retain the immutable request on any uncertain response or failed local cleanup.
   localStorage.removeItem(key(rid));pending=null;lines=[];tools?.reset();status('Barverkauf gespeichert: '+result.receiptNumber+'. Nicht TSE-signiert; Fiskalstatus im Beleg prüfen.');
   const receipt=result.receiptId?{id:result.receiptId}:null;
   if(receipt){const b=document.createElement('button');b.textContent='Rechnung '+result.receiptNumber+' öffnen';b.onclick=()=>openInvoice(receipt.id,result.receiptNumber).catch(e=>status(e.message));const dl=document.createElement('button');dl.textContent='DIN-A4-PDF herunterladen';dl.onclick=()=>download(receipt.id).catch(e=>status(e.message));$('tradeDocuments').replaceChildren(b,dl);loadInvoices();try{await openInvoice(receipt.id,result.receiptNumber)}catch{status('Rechnung '+result.receiptNumber+' gespeichert. Anzeige nicht verfügbar; über gespeicherte Rechnungen erneut öffnen.');}}
  }catch(e){if(e.status===400){try{localStorage.removeItem(key(rid));pending=null;tiers=(await api('/trade/prices?restaurantId='+encodeURIComponent(rid))).tiers;catalog();}catch{storageOK=false;}status(e.message+'\nNicht gebucht. Daten und aktuellen Betrag prüfen, dann erneut ausdrücklich bestätigen.')}else status(e.message+'\nBei unklarem Ergebnis dieselbe Zahlung abgleichen. Keine neue Verkaufskennung erzeugen.')}finally{busy=false;draw()}}
  $('tradePay').onclick=pay;$('tradeResume').onclick=pay;
  let invoiceArchiveHost=null;
  async function loadInvoices(target=invoiceArchiveHost){if(!target)return;invoiceArchiveHost=target;try{const r=await api('/trade/invoices?restaurantId='+encodeURIComponent(rid));if(!target.isConnected)return;target.replaceChildren(...r.invoices.map(i=>{const b=document.createElement('button');b.type='button';b.textContent=i.receipt_number+' · '+new Date(i.issued_at).toLocaleDateString('de-DE')+' · '+money(i.total_cents);b.onclick=()=>openInvoice(i.id,i.receipt_number).catch(e=>status(e.message));return b}));if(!r.invoices.length)target.textContent='Noch keine ausgestellten Rechnungen. Nach bestätigter Barzahlung wird die Rechnung hier automatisch gespeichert.';}catch(e){if(target.isConnected)target.textContent='Rechnungen konnten nicht geladen werden. Über „Archiv öffnen“ erneut versuchen.';}}
  if(window.bnCreateSaleTools)tools=window.bnCreateSaleTools(host.querySelector('.trade-layout > section:last-child'),{rid,mode:'trade',hideSaleTools:true,locked:()=>busy||!!pending||!storageOK,hasPayment:()=>!!pending,subtotal:()=>lines.reduce((s,l)=>s+(price(l.id,l.qty)||0)*l.qty,0),draft:()=>({items:lines.map(l=>({productId:l.id,qty:l.qty})),recipient:Object.fromEntries(['name','street','postalCode','city','country','vatId','taxNumber','email','phone'].map(k=>[k,($('trade-'+k)?.value||'').trim()]))}),load:d=>{const next=d.items.map(i=>{const p=products.find(p=>p.id===i.productId);if(!p)throw Error('Artikel nicht verfügbar. Bon bleibt erhalten.');return {id:p.id,name:p.name,qty:i.qty}});lines=next;for(const k of ['name','street','postalCode','city','country','vatId','taxNumber','email','phone'])$('trade-'+k).value=d.recipient?.[k]||(k==='country'?'Deutschland':'');},changed:()=>draw()});
  if(pending)tools?.restore(pending);
  addressCheck=window.bnMountCustomerDelivery?.(host.querySelector('.trade-layout > section:last-child'),{rid,confirmPayment:pay,invoiceArchive:loadInvoices,invoice:async()=>{const profile=await api('/billing/profile'),subtotal=lines.reduce((sum,l)=>sum+(price(l.id,l.qty)||0)*l.qty,0),totalCents=tools?tools.total(subtotal):subtotal;return {seller:profile.profile||{},items:lines.map(l=>({productId:l.id,unitCents:price(l.id,l.qty)||0})),totalCents,discountCents:subtotal-(tools&&subtotal?window.bnDiscountTotal(subtotal,tools.extras().discount):subtotal),depositLines:window.bnDepositBreakdown?.(rid,lines.map(l=>({productId:l.id,qty:l.qty})))||[]};},editItem:(id,qty)=>{if(busy||pending||!storageOK)throw Error('Zuerst Zahlung abgleichen.');const p=products.find(p=>p.id===id),existing=lines.find(l=>l.id===id),next=(existing?.qty||0)+qty;if(!p||!price(id,next))throw Error('Zuerst Händlerpreis festlegen.');if(next>999999||(!existing&&lines.length>=100))throw Error('Mengenlimit erreicht.');if(existing)existing.qty=next;else lines.push({id,name:p.name,qty});draw();},locked:()=>busy||!!pending||!storageOK,draft:()=>({items:lines.map(l=>({productId:l.id,qty:l.qty})),recipient:Object.fromEntries(['name','street','postalCode','city','country','vatId','taxNumber','email','phone'].map(k=>[k,($('trade-'+k)?.value||'').trim()]))})});
  if(pending)for(const k of ['email','phone']){const input=$('trade-'+k);if(input)input.value=pending.recipient?.[k]||'';}
  loadInvoices();catalog();draw();if(!tiers.length&&!pending){$('tradeTiers').closest('details').open=true;status(products.length?'Bitte zuerst Händlerpreise festlegen. Artikel bleiben bis dahin ohne Verkaufsbuchung auswählbar.':'Keine Artikel vorhanden. Bitte unter Mehr → Artikel anlegen.');}if(pending)status('Unterbrochene Barzahlung vorhanden. Zuerst abgleichen; die ursprünglichen Daten werden unverändert verwendet.');
 };
})();
