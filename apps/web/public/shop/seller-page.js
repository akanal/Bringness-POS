import {readSellerOffer,sendSellerCommand,pendingSellerRequest,sellerIdentity,onSellerPrivacy,sellerMessage} from './seller-account-client.js';
import {offerId} from './offer-policy.js';
import {offerHints,filterOffers,kindLabels} from './offer-review.js';
import {mountCategorySelect} from './category-controls.js';
import {validateOffer,loadOffers,saveOffers} from './offer-drafts.js?v=cloud-20261026';
import {preparationItems,singleOfferExport} from './offer-workspace.js';
import {money} from './catalog.js';
const $=id=>document.getElementById(id),form=$('offer-form');
let rows=[],selected=null,dirty=false,storage=null,cloudState=null,cloudEpoch=0,cloudOp=0,cloudBusy=false;
let cloudDisabled=new Map();
const status=message=>$('seller-status').textContent=message;
mountCategorySelect($('offer-category'));const categoryPrompt=element('option','Bitte Kategorie auswählen');categoryPrompt.value='';categoryPrompt.defaultSelected=true;$('offer-category').prepend(categoryPrompt);mountCategorySelect($('offer-list-category'),{includeAll:true});
try{storage=window.sessionStorage;rows=loadOffers(storage);}catch{status('Gespeicherte Entwürfe konnten nicht gelesen werden. Vorhandene Daten werden nicht überschrieben. Exportiere neue Entwürfe als Datei.');storage=null;}
function element(tag,text){const e=document.createElement(tag);e.textContent=text;return e;}
function syncKind(){const physical=form.elements.kind.value==='physical';$('physical-fields').hidden=!physical;$('fulfilment-fields').hidden=physical;form.elements.stock.required=physical;form.elements.delivery.required=physical;form.elements.fulfilment.required=!physical;form.elements.condition.disabled=!physical;}
function previewPrice(){const v=form.elements.price.value.trim(),rate=form.elements.tax.value;if(!/^\d{1,8}([.,]\d{1,2})?$/.test(v)){$('price-preview').textContent='Nettopreis mit höchstens zwei Nachkommastellen angeben.';return;}const cents=Math.round(Number(v.replace(',','.'))*100);$('price-preview').textContent=rate==='review'?`${money(cents)} netto · Steuer noch zu prüfen`:`${money(cents)} netto · ${money(cents+Math.round(cents*Number(rate)/100))} brutto (${rate} % MwSt.)`;}
function renderList(){
 const matches=filterOffers(rows,{query:$('offer-search').value,category:$('offer-list-category').value,kind:$('offer-list-kind').value,review:$('offer-list-review').value,sort:$('offer-list-sort').value,stock:$('offer-list-stock').value});
 $('offer-list').replaceChildren(element('p',`${matches.length} von ${rows.length} Entwürfen`));
 const hintCount=rows.filter(row=>offerHints(row,rows).length).length;$('offer-summary').textContent=`${rows.length} gespeichert · ${hintCount} mit Bearbeitungshinweisen · noch nicht veröffentlicht`;
 for(const row of matches){const article=element('article','');article.className='offer-row';article.setAttribute('aria-current',String(row.id===selected));const open=element('button','Bearbeiten');open.type='button';open.setAttribute('aria-label',row.title+' bearbeiten');open.onclick=()=>{if(!leaveEditor())return;fill(row);};
 const hints=offerHints(row,rows),badge=element('span',hints.length?`${hints.length} Hinweise`:'Entwurf');badge.className=hints.length?'offer-badge offer-hints':'offer-badge';
 article.append(element('h3',row.title),badge,element('p',`${kindLabels[row.kind]} · ${row.category}`),element('p',`${money(row.netCents)} netto · ${row.tax==='review'?'Steuer offen':row.tax+' % MwSt.'}`));if(row.sku)article.append(element('p','Artikelnummer: '+row.sku));if(row.kind==='physical')article.append(element('p','Bestand: '+row.stock));article.append(open);$('offer-list').append(article);}
 if(!matches.length)$('offer-list').append(element('p',rows.length?'Keine Entwürfe für diese Filter. Setze die Filter zurück oder wähle einen anderen Suchbegriff.':'Noch keine Angebotsentwürfe gespeichert.'));
 $('export-offers').disabled=!rows.length;
}
function leaveEditor(){return !dirty||window.confirm('Ungespeicherte Änderungen verwerfen?');}
function fill(row=null,{cloud=null}={}){cloudEpoch++;cloudState=cloud;form.hidden=false;$('cloud-editor-resume').hidden=true;form.reset();selected=cloud?null:row?.id||null;for(const key of ['title','category','kind','price','tax','stock','gtin','condition','sku','description','delivery','fulfilment'])if(row)form.elements[key].value=row[key];dirty=false;$('editor-save-state').textContent=row?'Gespeicherter Entwurf geöffnet.':'Neuer Entwurf – noch nicht gespeichert.';$('offer-checklist').hidden=true;$('offer-preview').hidden=true;$('cloud-editor-status').textContent=cloud?`Kontoentwurf · Stand ${cloud.revision}${cloud.sourceRevision?' · Inhalt aus Stand '+cloud.sourceRevision:''}${cloud.state==='archived'?' · archiviert, bitte zuerst wiederherstellen':''}`:'Lokaler Entwurf. Übertragung ins Betriebskonto nur über die eigene Schaltfläche.';$('delete-offer').disabled=!selected;$('duplicate-offer').disabled=!selected;syncKind();previewPrice();renderList();updateFormTools();}
function read(){const value=Object.fromEntries(new FormData(form));if(!value.condition)value.condition='new';return validateOffer(value);}
function persist(next){if(storage){try{saveOffers(storage,next);}catch{status('Speichern fehlgeschlagen. Der bisherige Stand bleibt erhalten. Deine Änderungen stehen weiterhin im Formular.');return false;}}else{status('Browserspeicher nicht verfügbar. Entwürfe bleiben nur bis zum Neuladen im Arbeitsspeicher; bitte exportieren.');}rows=next;return true;}
function commit({duplicate=false}={}){if(!form.reportValidity())return;try{const offer=read();const id=duplicate||!selected?'offer-'+crypto.randomUUID():selected;const next=selected&&!duplicate?rows.map(row=>row.id===selected?{...offer,id}:row):[...rows,{...offer,id}];if(next.length>50)throw Error('Höchstens 50 Entwürfe. Exportiere vorhandene Entwürfe zuerst.');if(!persist(next))return;fill({...offer,id});status(storage?'Entwurf in dieser Browsersitzung gespeichert. Noch nicht veröffentlicht.':'Entwurf im Arbeitsspeicher abgelegt. Bitte vor dem Neuladen exportieren.');}catch(error){status(error.message);}}
form.addEventListener('submit',event=>{event.preventDefault();commit();});
form.addEventListener('input',()=>{dirty=true;$('editor-save-state').textContent='Ungespeicherte Änderungen';$('offer-checklist').hidden=true;previewPrice();$('offer-preview').hidden=true;updateFormTools();});
form.addEventListener('change',()=>{dirty=true;$('editor-save-state').textContent='Ungespeicherte Änderungen';$('offer-checklist').hidden=true;syncKind();previewPrice();$('offer-preview').hidden=true;updateFormTools();});
$('new-offer').onclick=()=>{if(!leaveEditor())return;fill();form.elements.title.focus();status('Neuer Angebotsentwurf.');};
$('duplicate-offer').onclick=()=>commit({duplicate:true});
$('delete-offer').onclick=()=>{const row=rows.find(r=>r.id===selected);if(!row||!window.confirm(`Entwurf „${row.title}“ aus dieser Sitzung löschen?`))return;if(persist(rows.filter(r=>r.id!==selected))){fill();status('Entwurf gelöscht.');}};
$('offer-search').oninput=renderList;
for(const id of ['offer-list-category','offer-list-kind','offer-list-review','offer-list-sort','offer-list-stock'])$(id).onchange=renderList;
$('offer-filters-reset').onclick=()=>{$('offer-search').value='';$('offer-list-category').value='Alle';$('offer-list-kind').value='all';$('offer-list-stock').value='all';$('offer-list-review').value='all';$('offer-list-sort').value='title';renderList();};
$('check-offer').onclick=()=>{if(!form.reportValidity())return;try{const row={...read(),id:selected},hints=offerHints(row,rows),list=$('offer-checklist-items');list.replaceChildren();for(const hint of hints)list.append(element('li',hint));if(!hints.length)list.append(element('li','Keine dieser Bearbeitungshinweise gefunden. Veröffentlichung und fachliche Prüfung stehen weiterhin aus.'));$('offer-checklist').hidden=false;status('Aktuelle Formularangaben geprüft. Es wurde nichts gespeichert oder veröffentlicht.');}catch(error){status(error.message);}};
function previewCurrent(){if(form.hidden)return false;if(!form.reportValidity())return;try{const row=read(),box=$('preview-content');box.replaceChildren(element('h3',row.title),element('p',row.category+' · Entwurf'),element('p',row.description),element('p',`${money(row.netCents)} netto · ${row.tax==='review'?'Steuer noch zu prüfen':row.tax+' % MwSt.'}`),element('p',row.kind==='physical'?`Bestand: ${row.stock}\n${row.delivery}`:row.fulfilment));if(row.sku)box.append(element('p','Artikelnummer: '+row.sku));if(row.gtin)box.append(element('p','GTIN: '+row.gtin));$('offer-preview').hidden=false;$('offer-preview').scrollIntoView({behavior:'smooth',block:'start'});status('Vorschau aus den aktuellen Formularangaben. Noch nicht veröffentlicht.');return true;}catch(error){status(error.message);return false;}}
$('preview-offer').onclick=()=>previewCurrent();
$('export-offers').onclick=()=>{if(!rows.length)return;const payload={format:'bringness-offer-drafts',version:1,exportedAt:new Date().toISOString(),publication:'draft-only',offers:rows};const url=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download='bringness-angebotsentwuerfe.json';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);status('Export der gespeicherten Entwürfe gestartet. Ungespeicherte Formularänderungen sind nicht enthalten.');};
let importBusy=false;
$('import-offers').addEventListener('change',async()=>{
 if(importBusy)return;
 const file=$('import-offers').files?.[0];if(!file)return;
 importBusy=true;$('import-offers').disabled=true;
 try{
  if(file.size>600000)throw Error('Importdatei ist größer als 600 KB.');
  const value=JSON.parse(await file.text());
  if(!value||value.format!=='bringness-offer-drafts'||value.version!==1||value.publication!=='draft-only'||!Array.isArray(value.offers)||!value.offers.length||value.offers.length>50)throw Error('Keine unterstützte Bringness-Entwurfsdatei.');
  const imported=value.offers.map(row=>({...validateOffer(row),id:'offer-'+crypto.randomUUID()}));
  if(rows.length+imported.length>50)throw Error('Import würde die Grenze von 50 Entwürfen überschreiten.');
  if(!window.confirm(`${imported.length} Entwürfe als neue Kopien ergänzen?`))return;
  if(persist([...rows,...imported])){renderList();status(`${imported.length} Entwürfe ergänzt. Bestehende Entwürfe und das geöffnete Formular bleiben erhalten. Noch nichts veröffentlicht.`);}
 }catch{status('Import nicht übernommen. Prüfe Dateiformat, Pflichtangaben und die Grenze von 50 Entwürfen.');}
 finally{importBusy=false;$('import-offers').disabled=false;$('import-offers').value='';}
});
window.addEventListener('beforeunload' ,event=>{if(dirty||cloudBusy){event.preventDefault();event.returnValue='';}});

function cloudControls(busy){cloudBusy=busy;if(busy){cloudDisabled=new Map();for(const control of document.querySelectorAll('button,input,select,textarea')){cloudDisabled.set(control,control.disabled);control.disabled=true;}}else{for(const [control,disabled] of cloudDisabled)control.disabled=disabled;cloudDisabled.clear();syncKind();$('delete-offer').disabled=!selected;$('duplicate-offer').disabled=!selected;$('cloud-editor-save').disabled=!!cloudState&&form.hidden;}}
async function pendingCloud(){try{$('cloud-editor-retry').hidden=!(await pendingSellerRequest());}catch(error){$('cloud-editor-status').textContent=sellerMessage(error);}}
async function cloudAction(fn){if(cloudBusy)return;const op=++cloudOp,ticket=cloudEpoch;cloudControls(true);$('cloud-editor-status').textContent='Kontozugriff läuft …';try{await fn(()=>op===cloudOp&&ticket===cloudEpoch);}catch(error){if(op===cloudOp)$('cloud-editor-status').textContent=sellerMessage(error);}finally{if(op===cloudOp){cloudControls(false);await pendingCloud();}}}
const historical=()=>/^#cloud=(offer-[a-f0-9-]{36})(?:&revision=([1-9]\d{0,8}))?$/i.exec(location.hash);
if(historical())$('cloud-offer-id').value=historical()[1];
window.addEventListener('hashchange',()=>{cloudEpoch++;const target=historical();if(target){$('cloud-offer-id').value=target[1];$('cloud-editor-status').textContent='Versionslink geändert. Bitte den markierten Stand ausdrücklich laden. Formularänderungen bleiben erhalten.';}});
$('cloud-editor-load').onclick=()=>{if(!leaveEditor())return;cloudAction(async current=>{const id=$('cloud-offer-id').value.trim();if(!offerId(id))throw {code:'INVALID_REQUEST'};const target=historical(),revision=target&&target[1]===id&&target[2]?Number(target[2]):null;const result=await readSellerOffer(id,revision),binding=result.accountBinding;if(!current())return;fill({...result.offer,id:result.id},{cloud:{id:result.id,revision:result.revision,state:result.state,sourceRevision:result.sourceRevision,binding}});$('cloud-editor-status').textContent+=' · Aus dem Betriebskonto geladen.';});};
$('cloud-editor-save').onclick=()=>{if(!form.reportValidity())return;let offer;try{offer=read();}catch(error){$('cloud-editor-status').textContent=error.message;return;}cloudAction(async current=>{const binding=await sellerIdentity();if(cloudState&&cloudState.binding!==binding)throw {code:'ACCOUNT_CHANGED'};if(cloudState?.state==='archived')throw {code:'OFFER_ARCHIVED'};const id=cloudState?.id||selected||'offer-'+crypto.randomUUID(),result=await sendSellerCommand({id,expectedRevision:cloudState?.revision||0,requestId:crypto.randomUUID(),action:'save',offer});if(!current())return;cloudState={id:result.id,revision:result.revision,state:result.state,binding};$('cloud-offer-id').value=result.id;$('cloud-editor-status').textContent=`Dauerhaft im Betriebskonto gespeichert · Stand ${result.revision}. Noch nicht veröffentlicht.`;dirty=false;$('editor-save-state').textContent='Aktuelle Formularangaben im Betriebskonto gespeichert. Lokale Liste unverändert.';});};
$('cloud-editor-retry').onclick=()=>cloudAction(async current=>{const command=await pendingSellerRequest();if(!command)return;const result=await sendSellerCommand(command,{retry:true});if(!current())return;if(cloudState?.id===result.id)cloudState.revision=result.revision;$('cloud-editor-status').textContent='Ursprüngliche Anfrage bestätigt. Bitte den Kontoentwurf ausdrücklich laden, um den gespeicherten Inhalt zu prüfen.';});
$('cloud-editor-resume').onclick=()=>cloudAction(async current=>{if(!cloudState)return;const binding=await sellerIdentity();if(binding!==cloudState.binding)throw {code:'ACCOUNT_CHANGED'};const result=await readSellerOffer(cloudState.id);if(!current())return;form.hidden=false;$('cloud-editor-resume').hidden=true;$('cloud-editor-status').textContent=result.revision===cloudState.revision?'Zugang geprüft. Deine Formularänderungen sind weiterhin vorhanden.':'Ein neuerer Kontostand liegt vor. Deine Formularänderungen bleiben erhalten; bitte vor dem Speichern vergleichen.';});
onSellerPrivacy(reason=>{cloudOp++;cloudEpoch++;cloudControls(false);if(reason==='account'){if(cloudState){fill();$('preview-content').replaceChildren();$('offer-checklist-items').replaceChildren();}$('cloud-editor-status').textContent='Kontowechsel: private Kontoangaben entfernt. Bitte ausdrücklich neu laden.';}else if(cloudState){$('offer-preview').hidden=true;$('offer-checklist').hidden=true;form.hidden=true;$('cloud-editor-save').disabled=true;$('cloud-editor-resume').hidden=false;$('cloud-editor-status').textContent='Kontoansicht pausiert. Formularänderungen bleiben im Speicher; Zugang vor dem Weiterbearbeiten erneut prüfen.';}});
const countedFields=['title','description','sku','gtin','delivery','fulfilment'];
for(const name of countedFields){const input=form.elements[name],counter=element('p','');counter.id='count-'+name;counter.className='offer-character-count';input.after(counter);input.setAttribute('aria-describedby',((input.getAttribute('aria-describedby')||'')+' '+counter.id).trim());}
function updateFormTools(){
 for(const name of countedFields){const input=form.elements[name];$('count-'+name).textContent=`${input.value.length} / ${input.maxLength} Zeichen`;}
 const data=Object.fromEntries(new FormData(form)),items=preparationItems(data),done=items.filter(item=>item.complete).length;
 $('offer-preparation-summary').textContent=`${done} von ${items.length} Bearbeitungspunkten ausgefüllt`;
 $('offer-preparation-items').replaceChildren(...items.map(item=>element('li',(item.complete?'Ausgefüllt: ':'Offen: ')+item.label)));
}
for(const control of document.querySelectorAll('[data-new-kind]'))control.onclick=()=>{if(cloudBusy||!leaveEditor())return;fill();form.elements.kind.value=control.dataset.newKind;syncKind();updateFormTools();form.elements.title.focus();status('Neuer Entwurf: '+kindLabels[control.dataset.newKind]+'. Preis, Merkmale und Bereitstellung bitte selbst ergänzen.');};
$('export-current-offer').onclick=()=>{if(cloudBusy||form.hidden||!form.reportValidity())return;let url;try{const payload=singleOfferExport(read(),{id:selected||cloudState?.id||'offer-'+crypto.randomUUID()});url=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}));const a=element('a','');a.href=url;a.download='bringness-einzelentwurf.json';document.body.append(a);a.click();a.remove();status('Aktuelle Formularangaben als einzelner Entwurf exportiert. Konto und lokale Liste bleiben unverändert.');}catch(error){status(error.message);}finally{if(url)setTimeout(()=>URL.revokeObjectURL(url),1000);}};
function finishPrint(){document.body.classList.remove('offer-printing');}
window.addEventListener('afterprint',finishPrint);
$('print-current-offer').onclick=()=>{if(cloudBusy||form.hidden||!previewCurrent())return;try{document.body.classList.add('offer-printing');window.print();status('Druckansicht für diesen Entwurf geöffnet. Keine Rechnung oder Veröffentlichung.');}catch{status('Drucken hier nicht verfügbar. Bitte den einzelnen Entwurf exportieren.');}finally{finishPrint();}};
fill();pendingCloud();


// A proposal is untrusted text, never a save or a publication command.
try {
 const key='bringness.assistant.offer-proposal.v1',raw=sessionStorage.getItem(key),p=raw&&JSON.parse(raw);
 if(p&&typeof p.title==='string'&&p.title.trim()&&p.title.length<=120&&typeof p.description==='string'&&p.description.trim()&&p.description.length<=4000&&Number.isFinite(p.createdAt)&&Date.now()-p.createdAt>=0&&Date.now()-p.createdAt<86400000){
  const box=$('assistant-proposal');box.hidden=false;$('assistant-proposal-preview').replaceChildren(element('h4',p.title),element('p',p.description));
  $('assistant-apply').onclick=()=>{if(cloudBusy||form.hidden)return;if((form.elements.title.value||form.elements.description.value)&&!window.confirm('Titel und Beschreibung im geöffneten Entwurf durch den Assistenten-Vorschlag ersetzen?'))return;form.elements.title.value=p.title;form.elements.description.value=p.description;form.dispatchEvent(new Event('input',{bubbles:true}));sessionStorage.removeItem(key);box.hidden=true;status('Text übernommen. Bitte prüfen und ausdrücklich speichern. Preis, Steuer und Bestand bleiben erhalten.');};
  $('assistant-discard').onclick=()=>{sessionStorage.removeItem(key);box.hidden=true;};
 }else if(raw)sessionStorage.removeItem(key);
}catch{/* Unavailable session storage must never block the editor. */}
