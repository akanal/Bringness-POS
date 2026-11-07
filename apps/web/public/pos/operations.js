const $=id=>document.getElementById(id),tokenKey='bringness-pos-token';
let rows=[],pending=null,busy=false,epoch=0,restaurantId=null;
const drafts=new Map(),views=new Map(),fields=['countedUnits','minimumUnits','targetUnits'];
const el=(tag,text)=>{const x=document.createElement(tag);if(text!==undefined)x.textContent=text;return x};
const values=row=>Object.fromEntries(fields.map((k,i)=>[k,String([row.counted_units,row.minimum_units,row.target_units][i]??'')]));
const folded=text=>String(text).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('de-DE').replace(/ß/g,'ss');
const isCounted=row=>row.revision!=null,isLow=row=>isCounted(row)&&row.counted_units<=row.minimum_units;
function visible(row){const words=folded($('inventory-query').value.trim()).split(/\s+/).filter(Boolean),filter=$('inventory-filter').value;return words.every(word=>folded(row.name).includes(word))&&(filter==='all'||filter==='low'&&isLow(row)||filter==='uncounted'&&!isCounted(row)||filter==='counted'&&isCounted(row))}
function hasFreshTimes(){return rows.every(row=>!isCounted(row)||Boolean(row.counted_at))}
function lock(){
 const waiting=busy||Boolean(pending),dirty=drafts.size>0;
 for(const node of document.querySelectorAll('#inventory button,#inventory input,#refresh,#inventory-query,#inventory-filter'))node.disabled=waiting;
 $('restaurant').disabled=waiting||dirty;$('load').disabled=waiting||dirty;
 for(const id of ['export','inventory-csv','count-sheet'])$(id).disabled=waiting||dirty||!restaurantId||!rows.length||!hasFreshTimes();
 $('discard-all').disabled=waiting||!dirty;$('retry').hidden=!pending;$('retry').disabled=busy;
 for(const [id,view] of views){view.reset.disabled=waiting||!drafts.has(id);view.save.disabled=waiting||Boolean(drafts.get(id)?.conflict)}
}
function summary(){
 document.getElementById('inventory-print')?.remove();
 const shown=rows.filter(visible).length,counted=rows.filter(isCounted).length,low=rows.filter(isLow).length;
 $('inventory-summary').textContent=restaurantId?`${shown} von ${rows.length} Artikeln · ${counted} gezählt · ${rows.length-counted} ungezählt · ${low} am Mindestbestand.`:'';
 $('draft-summary').textContent=drafts.size?`${drafts.size} Artikel mit offenen Eingaben. Bitte speichern oder ausdrücklich verwerfen. Exporte sind bis dahin gesperrt.`:'';
 for(const row of rows){const view=views.get(row.id);if(view)view.card.hidden=!visible(row)}
 lock();
}
function clear(){epoch++;rows=[];drafts.clear();views.clear();pending=null;busy=false;restaurantId=null;$('inventory').replaceChildren();$('restaurant').replaceChildren();$('inventory-query').value='';$('inventory-filter').value='all';$('status').textContent='Private POS-Ansicht geschlossen. Bitte neu laden.';summary()}
async function request(path,body){const token=localStorage.getItem(tokenKey);if(!token)throw Error('Bitte in der POS-Kasse anmelden.');const r=await fetch('/api/v1'+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),credentials:'omit',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(20000)});const data=await r.json();if(token!==localStorage.getItem(tokenKey)||document.hidden)throw Error('POS-Konto oder Ansicht gewechselt.');if(!r.ok)throw Object.assign(Error(r.status>=500?'POS-Bestand derzeit nicht verfügbar.':data.error||'Zugriff nicht möglich'),{definitive:r.status>=400&&r.status<500,status:r.status});return data}
async function task(work){if(busy)return;busy=true;lock();const current=epoch;try{await work(current)}catch(error){if(current===epoch)$('status').textContent=error.message}finally{if(current===epoch){busy=false;lock()}}}
function draftFor(row,form){
 const old=drafts.get(row.id),baseline=old?.baseline||values(row),raw=Object.fromEntries(fields.map(k=>[k,form.elements[k].value]));
 if(!old?.conflict&&fields.every(k=>raw[k]===baseline[k]))drafts.delete(row.id);
 else drafts.set(row.id,{values:raw,baseline,revision:old?.revision??row.revision??0,conflict:old?.conflict||false,error:old?.error||'',name:row.name});
 const view=views.get(row.id);view.note.textContent=drafts.has(row.id)?'Noch nicht gespeichert.':'';summary();
}
function feedback(id,text,bad=false){const view=views.get(id);if(!view)return;view.message.textContent=text;view.message.hidden=!text;view.message.dataset.error=String(bad);if(bad)view.message.scrollIntoView({block:'nearest'})}
function render(){
 views.clear();$('inventory').replaceChildren();
 for(const row of rows){
  const draft=drafts.get(row.id);if(draft&&(row.revision??0)!==draft.revision)draft.conflict=true;
  const card=el('article');card.dataset.productId=row.id;card.dataset.low=String(isLow(row));card.append(el('h3',row.name));
  const detail=!isCounted(row)?'Noch nicht gezählt.':(isLow(row)?'Mindestbestand erreicht · ':'')+`Gezählt: ${row.counted_units} · Minimum: ${row.minimum_units} · Ziel: ${row.target_units} · `+(row.counted_at?new Date(row.counted_at).toLocaleString('de-DE',{hourCycle:'h23'}):'Speicherung bestätigt; Zählzeitpunkt bitte aktualisieren.');card.append(el('p',detail));
  const note=el('p',draft?'Noch nicht gespeichert.':'');note.className='draft-note';card.append(note);
  const form=el('form');form.noValidate=true;const initial=draft?.values||values(row);
  for(const[k,label]of[['countedUnits','Gezählte Stück'],['minimumUnits','Mindestmenge'],['targetUnits','Zielmenge']]){const l=el('label',label),input=el('input');input.type='number';input.name=k;input.min='0';input.max='1000000';input.step='1';input.required=true;input.value=initial[k];input.oninput=()=>draftFor(row,form);l.append(input);form.append(l)}
  const save=el('button','Zählstand speichern'),reset=el('button',draft?.conflict?'Serverstand neu laden':'Eingaben verwerfen');save.type='submit';reset.type='button';form.append(save,reset);card.append(form);
  const message=el('p');message.className='inventory-feedback';message.setAttribute('role','status');message.hidden=true;card.append(message);views.set(row.id,{card,form,note,save,reset,message});
  if(draft?.conflict)feedback(row.id,'Der Serverstand wurde inzwischen geändert. Deine Eingaben bleiben erhalten. Bitte den aktuellen Serverstand laden und die Werte neu prüfen.',true);
  else if(draft?.error)feedback(row.id,draft.error,true);
  form.onsubmit=event=>{
   event.preventDefault();if(busy||pending)return;draftFor(row,form);const entry=drafts.get(row.id);
   if(entry?.conflict){feedback(row.id,'Bitte zuerst den aktuellen Serverstand laden und die Eingaben neu prüfen.',true);return}
   const raw=Object.fromEntries(fields.map(k=>[k,form.elements[k].value])),counts=Object.fromEntries(fields.map(k=>[k,Number(raw[k])]));
   if(fields.some(k=>raw[k]===''||!Number.isSafeInteger(counts[k])||counts[k]<0||counts[k]>1000000)){feedback(row.id,'Bitte für jede Menge eine ganze Stückzahl von 0 bis 1000000 eingeben.',true);return}
   if(counts.targetUnits<counts.minimumUnits){feedback(row.id,'Zielmenge muss mindestens der Mindestmenge entsprechen.',true);return}
   pending={requestId:crypto.randomUUID(),restaurantId,productId:row.id,expectedRevision:entry?.revision??row.revision??0,...counts};task(saveCount);
  };
  reset.onclick=()=>{
   if(!drafts.has(row.id)||busy||pending)return;
   if(!window.confirm('Die offenen Eingaben für diesen Artikel verwerfen?'))return;
   if(drafts.get(row.id).conflict)task(async current=>{const data=await fetchRows(restaurantId);if(current!==epoch)return;drafts.delete(row.id);rows=data.rows;render();$('status').textContent='Aktueller Serverstand geladen. Andere offene Eingaben bleiben erhalten.'});
   else{drafts.delete(row.id);render();$('status').textContent='Offene Eingaben für diesen Artikel verworfen.'}
  };
  $('inventory').append(card);
 }
 for(const [id,draft] of drafts){if(rows.some(row=>row.id===id))continue;const card=el('article');card.dataset.orphan='true';card.append(el('h3',draft.name),el('p','Dieser Artikel ist nicht mehr in der aktuellen Artikelliste verfügbar. Die offenen Eingaben wurden nicht gespeichert.'),el('p',`Deine Eingaben: Gezählt ${draft.values.countedUnits||'(leer)'} · Minimum ${draft.values.minimumUnits||'(leer)'} · Ziel ${draft.values.targetUnits||'(leer)'}`));const discard=el('button','Eingaben für nicht verfügbaren Artikel verwerfen');discard.type='button';discard.onclick=()=>{if(busy||pending||!window.confirm('Diese ungespeicherten Eingaben für den nicht verfügbaren Artikel verwerfen?'))return;drafts.delete(id);render()};card.append(discard);$('inventory').append(card)}
 if(!rows.length)$('inventory').append(el('p','Keine aktiven Artikel vorhanden.'));
 else{const empty=el('p','Keine Artikel für diese Suche oder diesen Filter.');empty.id='inventory-empty';$('inventory').append(empty)}
 summary();if($('inventory-empty'))$('inventory-empty').hidden=rows.some(visible);
}
async function fetchRows(id){const data=await request('/pos-inventory?restaurantId='+encodeURIComponent(id));if(data.restaurantId!==id||!Array.isArray(data.rows))throw Error('Zählstände nicht eindeutig bestätigt. Bitte erneut laden.');return data}
async function refresh(current){const id=$('restaurant').value;if(!id)throw Error('Bitte zuerst Betriebe laden.');const data=await fetchRows(id);if(current!==epoch||id!==$('restaurant').value)return;
 if(restaurantId&&restaurantId!==id&&drafts.size)throw Error('Bitte offene Eingaben zuerst speichern oder verwerfen.');
 restaurantId=id;rows=data.rows;render();$('status').textContent=drafts.size?'Serverstände aktualisiert. Offene Eingaben sind erhalten geblieben.':'Manuelle Zählstände geladen.';
}
async function saveCount(current){
 const command=pending;feedback(command.productId,'Zählstand wird gespeichert …');
 try{
  const ack=await request('/pos-inventory',command);if(current!==epoch)return;
  if(ack.requestId!==command.requestId||ack.productId!==command.productId||ack.revision!==command.expectedRevision+1)throw Error('Speicherung nicht bestätigt. Dieselbe Anfrage erneut prüfen.');
  pending=null;drafts.delete(command.productId);
  rows=rows.map(row=>row.id===command.productId?{...row,revision:ack.revision,counted_units:command.countedUnits,minimum_units:command.minimumUnits,target_units:command.targetUnits,counted_at:null}:row);render();
  try{const data=await fetchRows(restaurantId);if(current!==epoch)return;rows=data.rows;render();$('status').textContent='Zählstand gespeichert. Andere offene Eingaben bleiben erhalten.';feedback(command.productId,'Zählstand gespeichert.')}
  catch(error){if(current!==epoch)return;$('status').textContent='Zählstand gespeichert. Der aktuelle Zählzeitpunkt konnte noch nicht geladen werden. Bitte aktualisieren.';feedback(command.productId,'Speicherung bestätigt. Bitte die Zählstände aktualisieren, bevor du exportierst.')}
 }catch(error){
  if(current===epoch){if(error.definitive){pending=null;const entry=drafts.get(command.productId);if(entry){entry.error=error.message;if(error.status===409)entry.conflict=true}render()}feedback(command.productId,error.message,true)}
  throw error;
 }
}
$('load').onclick=()=>task(async current=>{if(drafts.size)throw Error('Bitte offene Eingaben zuerst speichern oder verwerfen.');const data=await request('/bootstrap');if(current!==epoch)return;
 const old=$('restaurant').value,wanted=window.parent!==window&&new URLSearchParams(location.search).get('embedded')==='1'?new URLSearchParams(location.search).get('restaurantId'):old;
 $('restaurant').replaceChildren(...data.restaurants.map(row=>{const option=el('option',row.name);option.value=row.id;return option}));
 if(wanted&&!data.restaurants.some(row=>row.id===wanted)){rows=[];restaurantId=null;views.clear();$('inventory').replaceChildren();summary();throw Error('Der in den Einstellungen gewählte Betrieb ist nicht verfügbar. Bitte Betrieb prüfen.')}
 if(wanted)$('restaurant').value=wanted;if(restaurantId!==$('restaurant').value){rows=[];restaurantId=null;views.clear();$('inventory').replaceChildren();summary()}await refresh(current);
});
$('refresh').onclick=()=>task(refresh);$('restaurant').onchange=()=>{if(drafts.size||pending){$('restaurant').value=restaurantId;$('status').textContent='Bitte offene Eingaben zuerst speichern oder verwerfen.';return}rows=[];restaurantId=null;views.clear();$('inventory').replaceChildren();summary();task(refresh)};
$('retry').onclick=()=>pending&&task(saveCount);
for(const id of ['inventory-query','inventory-filter'])$(id).addEventListener(id==='inventory-query'?'input':'change',()=>{summary();if($('inventory-empty'))$('inventory-empty').hidden=rows.some(visible)});
$('discard-all').onclick=()=>{if(!drafts.size||busy||pending||!window.confirm('Alle offenen Eingaben in dieser Ansicht verwerfen? Gespeicherte Zählstände bleiben erhalten.'))return;drafts.clear();render();$('status').textContent='Offene Eingaben verworfen. Gespeicherte Zählstände bleiben erhalten.'};
function csv(lines){const quote=value=>'"'+String(value??'').replace(/^(\s*[=+@-])/,match=>typeof value==='number'?match:"'"+match).replace(/"/g,'""')+'"';return '\ufeff'+lines.map(line=>line.map(quote).join(';')).join('\r\n')}
function download(lines,name){if(busy||pending||drafts.size||!hasFreshTimes()||!restaurantId)return false;const url=URL.createObjectURL(new Blob([csv(lines)],{type:'text/csv;charset=utf-8'})),link=el('a');link.href=url;link.download=name;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);return true}
$('export').onclick=()=>{if(download([['Artikel','Nachbestellung Stück','Gezählt Stück','Minimum','Ziel','Zählzeitpunkt'],...rows.filter(row=>isLow(row)&&row.target_units>row.counted_units).map(row=>[row.name,row.target_units-row.counted_units,row.counted_units,row.minimum_units,row.target_units,row.counted_at])],'Bringness-POS-Nachbestellliste.csv'))$('status').textContent='Manuelle Nachbestellliste erstellt. Kein Lieferantenauftrag ausgelöst.'};
$('inventory-csv').onclick=()=>{if(download([['Artikel','Zählstatus','Gezählt Stück','Minimum','Ziel','Zählzeitpunkt'],...rows.map(row=>[row.name,!isCounted(row)?'Nicht gezählt':isLow(row)?'Mindestbestand erreicht':'Gezählt',row.counted_units,row.minimum_units,row.target_units,row.counted_at])],'Bringness-POS-Bestandsuebersicht.csv'))$('status').textContent='Bestandsübersicht aus bestätigten Zählständen erstellt. Ungezählte Artikel bleiben ohne Mengenangabe.'};
$('count-sheet').onclick=()=>{
 if(busy||pending||drafts.size||!restaurantId)return;const selected=rows.filter(visible);if(!selected.length){$('status').textContent='Keine sichtbaren Artikel zum Drucken.';return}
 document.getElementById('test-print')?.remove();document.getElementById('inventory-print')?.remove();const sheet=el('section');sheet.id='inventory-print';sheet.hidden=true;
 sheet.append(el('h1','Bringness POS · Inventur-Zählliste'),el('p','Betrieb: '+$('restaurant').selectedOptions[0].textContent),el('p','Erstellt: '+new Date().toLocaleString('de-DE',{hourCycle:'h23'})+' · '+selected.length+' sichtbare Artikel'),el('p','Manuelle Zählliste. Keine Bestandsbuchung, kein Verkauf und kein Lieferantenauftrag. Angaben in der Spalte Vorheriger Zählstand sind gespeicherte Momentaufnahmen.'));
 const table=el('table'),head=el('thead'),header=el('tr');for(const name of ['Artikel','Vorheriger Zählstand','Minimum','Ziel','Jetzt gezählt'])header.append(el('th',name));head.append(header);table.append(head);const body=el('tbody');
 for(const row of selected){const line=el('tr');for(const value of [row.name,isCounted(row)?row.counted_units:'Nicht gezählt',row.minimum_units??'',row.target_units??'','']){const cell=el('td',value);line.append(cell)}line.lastElementChild.className='write-space';body.append(line)}table.append(body);sheet.append(table);document.body.append(sheet);window.print();$('status').textContent='Zählliste zum Drucken vorbereitet. Es wurde kein Zählstand gespeichert.';
};
// Synchronous same-origin parent navigation check: booleans only, no credentials or inventory data.
window.posOperationsLeaveState=()=>({dirty:drafts.size>0,pending:Boolean(pending),busy});
window.addEventListener('beforeunload',event=>{if(drafts.size||pending){event.preventDefault();event.returnValue=''}});
$('scanner').onsubmit=e=>{e.preventDefault();const value=$('scan').value.trim();$('scan-result').textContent=value?'Code empfangen: '+value+' · Länge '+value.length+'. Bitte mit dem gedruckten Testcode vergleichen.':'Kein Code empfangen.';$('scan').value='';};let printRequested=false;$('print').onclick=()=>{document.getElementById('test-print')?.remove();document.getElementById('inventory-print')?.remove();const p=el('pre','Bringness POS · DRUCKERTEST\nKeine Rechnung · Kein Verkauf\n0123456789\nÄÖÜ äöü ß €\nPapier, Lesbarkeit und Schnitt prüfen.');p.id='test-print';p.hidden=true;document.body.append(p);printRequested=true;$('paper-confirm').checked=false;$('print-result').textContent='Druckdialog geöffnet. Tatsächlichen Papierausdruck bitte prüfen.';window.print();};$('paper-confirm').onchange=()=>{$('print-result').textContent=printRequested&&$('paper-confirm').checked?'Papierprüfung durch Nutzer bestätigt; kein automatischer Gerätenachweis.':'Noch kein Papierausdruck bestätigt.';};window.addEventListener('storage',e=>{if(e.key===null||e.key===tokenKey)clear();});window.addEventListener('pagehide',clear);lock();

if(window.parent!==window&&new URLSearchParams(location.search).get('embedded')==='1'){document.documentElement.classList.add('pos-operations-embedded');let scheduled=false;const height=()=>{if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;window.parent.postMessage({type:'bringness:pos-operations-height',height:document.body.offsetHeight+32},location.origin);});};const observer=new ResizeObserver(height);observer.observe(document.body);window.addEventListener('resize',height);window.addEventListener('pagehide',()=>{observer.disconnect();window.removeEventListener('resize',height);},{once:true});height();}
