(()=>{
 const fields=['name','street','postalCode','city','country','vatId'];
 const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function printNote(note){
  const frame=document.createElement('iframe');frame.title='Lieferschein drucken';frame.style.cssText='position:fixed;width:1px;height:1px;bottom:0;border:0';
  frame.onload=()=>{frame.contentWindow.focus();frame.contentWindow.print();};
  frame.srcdoc='<!doctype html><html lang="de"><meta charset="utf-8"><title>'+escape(note.number)+'</title><style>body{font:14px Arial;margin:20mm}table{width:100%;border-collapse:collapse}td,th{text-align:left;padding:8px;border-bottom:1px solid #ccc}p{white-space:pre-wrap}@page{size:A4;margin:15mm}</style><h1>Lieferschein</h1><p>'+escape(note.number)+' · '+escape(new Date(note.issued_at).toLocaleDateString('de-DE'))+'</p><p>'+escape(note.sender?.company_name)+'<br>'+escape(note.sender?.street)+'<br>'+escape(note.sender?.postal_code)+' '+escape(note.sender?.city)+'</p><h2>Empfänger</h2><p>'+fields.filter(k=>k!=='vatId').map(k=>escape(note.recipient[k])).join('<br>')+'</p><table><thead><tr><th>Artikel</th><th>Menge</th></tr></thead><tbody>'+note.items.map(i=>'<tr><td>'+escape(i.name)+'</td><td>'+escape(i.qty)+'</td></tr>').join('')+'</tbody></table><p>'+escape(note.note)+'</p><p>Dieser Lieferschein ist keine Rechnung und bestätigt keine Zahlung.</p><p>Empfang bestätigt: ____________________ Datum: __________</p></html>';
  document.querySelectorAll('iframe[data-delivery-print]').forEach(e=>e.remove());frame.dataset.deliveryPrint='true';document.body.append(frame);
 }
 window.bnMountCustomerDelivery=(host,{rid,draft,locked})=>{
  const section=document.createElement('section');section.className='trade-panel';section.innerHTML='<h3>Kunden & Lieferscheine</h3><label>Kunden suchen<input type="search" data-search maxlength="160"></label><button type="button" data-find>Suchen</button><label>Gespeicherte Kunden<select data-customers><option value="">Kunde auswählen</option></select></label><button type="button" data-use>Adresse übernehmen</button><label>E-Mail (optional)<input data-email type="email" maxlength="254"></label><label>Telefon (optional)<input data-phone maxlength="60"></label><button type="button" data-save>Kopie der Empfängeradresse als neuen Kunden speichern</button><button type="button" data-update>Ausgewählten Kunden aktualisieren</button><label>Liefernotiz<textarea data-note maxlength="1000"></textarea></label><button type="button" data-issue>Unbezahlten Lieferschein aus Warenkorb erstellen</button><button type="button" data-retry hidden>Unterbrochene Lieferscheinerstellung abgleichen</button><button type="button" data-archive>Lieferscheine laden</button><div data-documents></div><p role="status" data-status></p><small>Der Warenkorb bleibt erhalten. Es werden keine Zahlung, Rechnung oder Lagerbewegung gebucht.</small>';
  host.append(section);const el=s=>section.querySelector('[data-'+s+']'),status=s=>el('status').textContent=s;
  let customers=[],busy=false;const storageKey='bringness.delivery.pending.v1:'+rid;
  const guard=()=>{if(busy||locked())throw Error('Zuerst die laufende Zahlung abschließen oder abgleichen.');};
  const action=fn=>async()=>{try{guard();busy=true;await fn();}catch(e){status(e.message);}finally{busy=false;}};
  const load=async()=>{customers=(await api('/customers?restaurantId='+encodeURIComponent(rid)+'&q='+encodeURIComponent(el('search').value))).customers;el('customers').replaceChildren(new Option('Kunde auswählen',''),...customers.map(c=>new Option(c.data.name+' · '+c.data.city,c.id)));};
  el('find').onclick=action(load);
  el('use').onclick=action(async()=>{const c=customers.find(c=>c.id===el('customers').value);if(!c)throw Error('Kunden auswählen');for(const k of fields)document.getElementById('trade-'+k).value=c.data[k]||'';el('email').value=c.data.email||'';el('phone').value=c.data.phone||'';status('Kundenadresse übernommen.');});
  const save=async update=>{const c=customers.find(c=>c.id===el('customers').value);if(update&&!c)throw Error('Kunden auswählen');const customer={...draft().recipient,email:el('email').value,phone:el('phone').value};const result=await api('/customers',{method:update?'PUT':'POST',body:JSON.stringify({restaurantId:rid,customer,...(update?{id:c.id,version:c.version}:{})})});await load();el('customers').value=result.id;status('Kunde gespeichert. Bestehende Dokumente bleiben unverändert.');};
  el('save').onclick=action(()=>save(false));el('update').onclick=action(()=>save(true));
  const show=note=>{const b=document.createElement('button');b.type='button';b.textContent=note.number+' · '+note.recipient.name+' · Drucken';b.onclick=()=>printNote(note);el('documents').prepend(b);};
  const refresh=()=>{try{el('retry').hidden=!localStorage.getItem(storageKey);}catch{el('issue').disabled=true;status('Speicher nicht verfügbar. Keine neue Lieferscheinerstellung möglich.');}};
  const issue=async retry=>{
   let request;const raw=localStorage.getItem(storageKey);
   if(raw){if(!retry)throw Error('Zuerst den gespeicherten Lieferschein abgleichen.');request=JSON.parse(raw);if(request.restaurantId!==rid)throw Error('Ungültiger Lieferscheinspeicher');}
   else{if(retry)throw Error('Kein offener Lieferschein');const d=draft();if(!d.items.length)throw Error('Artikel auswählen');request={restaurantId:rid,requestKey:crypto.randomUUID(),recipient:d.recipient,items:d.items,note:el('note').value};localStorage.setItem(storageKey,JSON.stringify(request));}
   try{const result=await api('/delivery-notes',{method:'POST',body:JSON.stringify(request)});if(!result.deliveryNote?.id)throw Error('Bestätigung unklar. Dieselbe Erstellung erneut abgleichen.');localStorage.removeItem(storageKey);show(result.deliveryNote);status('Lieferschein gespeichert. Keine Zahlung gebucht; Warenkorb bleibt erhalten.');}
   catch(e){if(e.status===400)localStorage.removeItem(storageKey);throw e;}finally{refresh();}
  };
  el('issue').onclick=action(()=>issue(false));el('retry').onclick=action(()=>issue(true));el('archive').onclick=action(async()=>{const r=await api('/delivery-notes?restaurantId='+encodeURIComponent(rid));el('documents').replaceChildren();r.deliveryNotes.forEach(show);status(r.deliveryNotes.length+' Lieferscheine geladen.');});
  refresh();load().catch(e=>status(e.message));
 };
 window.renderCustomerDeliveryModule=async()=>{
  const host=document.getElementById('moduleBody'),rid=document.getElementById('restaurant').value;
  host.innerHTML='<section class="trade-panel"><h3>Empfängeradresse</h3>'+fields.map(k=>'<label>'+escape({name:'Name / Firma',street:'Straße und Hausnummer',postalCode:'Postleitzahl',city:'Ort',country:'Land',vatId:'USt-IdNr.'}[k])+'<input id="trade-'+k+'"></label>').join('')+'<h3>Lieferpositionen</h3><div data-delivery-products></div></section>';
  document.getElementById('trade-country').value='Deutschland';const products=data.products.filter(p=>p.restaurantId===rid),area=host.querySelector('[data-delivery-products]');
  area.innerHTML=products.map(p=>'<label>'+escape(p.name)+'<input data-delivery-qty="'+escape(p.id)+'" type="number" min="0" max="999999" step="1" value="0"></label>').join('');
  window.bnMountCustomerDelivery(host,{rid,locked:()=>false,draft:()=>({recipient:Object.fromEntries(fields.map(k=>[k,document.getElementById('trade-'+k).value.trim()])),items:[...area.querySelectorAll('input')].filter(i=>Number(i.value)!==0).map(i=>({productId:i.dataset.deliveryQty,qty:Number(i.value)}))})});
 };
})();
