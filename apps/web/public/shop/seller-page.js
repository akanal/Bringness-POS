import {mountCategorySelect} from './category-controls.js';
import {validateOffer,loadOffers,saveOffers} from './offer-drafts.js?v=categories-20261026';
import {money} from './catalog.js';
const $=id=>document.getElementById(id),form=$('offer-form');
let rows=[],selected=null,dirty=false,storage=null;
const status=message=>$('seller-status').textContent=message;
mountCategorySelect($('offer-category'));
try{storage=window.sessionStorage;rows=loadOffers(storage);}catch{status('Gespeicherte Entwürfe konnten nicht gelesen werden. Vorhandene Daten werden nicht überschrieben. Exportiere neue Entwürfe als Datei.');storage=null;}
function element(tag,text){const e=document.createElement(tag);e.textContent=text;return e;}
function syncKind(){const physical=form.elements.kind.value==='physical';$('physical-fields').hidden=!physical;$('fulfilment-fields').hidden=physical;form.elements.stock.required=physical;form.elements.delivery.required=physical;form.elements.fulfilment.required=!physical;form.elements.condition.disabled=!physical;}
function previewPrice(){const v=form.elements.price.value.trim(),rate=form.elements.tax.value;if(!/^\d{1,8}([.,]\d{1,2})?$/.test(v)){$('price-preview').textContent='Nettopreis mit höchstens zwei Nachkommastellen angeben.';return;}const cents=Math.round(Number(v.replace(',','.'))*100);$('price-preview').textContent=rate==='review'?`${money(cents)} netto · Steuer noch zu prüfen`:`${money(cents)} netto · ${money(cents+Math.round(cents*Number(rate)/100))} brutto (${rate} % MwSt.)`;}
function renderList(){const query=$('offer-search').value.trim().toLocaleLowerCase('de');const matches=rows.filter(r=>`${r.title} ${r.category} ${r.sku}`.toLocaleLowerCase('de').includes(query));$('offer-list').replaceChildren(element('p',`${matches.length} von ${rows.length} Entwürfen`));for(const row of matches){const article=element('article','');article.className='offer-row';article.setAttribute('aria-current',String(row.id===selected));const open=element('button','Bearbeiten');open.type='button';open.setAttribute('aria-label',row.title+' bearbeiten');open.onclick=()=>{if(!leaveEditor())return;fill(row);};article.append(element('h3',row.title),element('p',`${row.category} · ${money(row.netCents)} netto`),open);$('offer-list').append(article);}if(!matches.length)$('offer-list').append(element('p',query?'Keine passenden Entwürfe.':'Noch keine Angebotsentwürfe gespeichert.'));$('export-offers').disabled=!rows.length;}
function leaveEditor(){return !dirty||window.confirm('Ungespeicherte Änderungen verwerfen?');}
function fill(row=null){form.reset();selected=row?.id||null;for(const key of ['title','category','kind','price','tax','stock','gtin','condition','sku','description','delivery','fulfilment'])if(row)form.elements[key].value=row[key];dirty=false;$('offer-preview').hidden=true;$('delete-offer').disabled=!selected;$('duplicate-offer').disabled=!selected;syncKind();previewPrice();renderList();}
function read(){const value=Object.fromEntries(new FormData(form));if(!value.condition)value.condition='new';return validateOffer(value);}
function persist(next){if(storage){try{saveOffers(storage,next);}catch{status('Speichern fehlgeschlagen. Der bisherige Stand bleibt erhalten. Deine Änderungen stehen weiterhin im Formular.');return false;}}else{status('Browserspeicher nicht verfügbar. Entwürfe bleiben nur bis zum Neuladen im Arbeitsspeicher; bitte exportieren.');}rows=next;return true;}
function commit({duplicate=false}={}){if(!form.reportValidity())return;try{const offer=read();const id=duplicate||!selected?'offer-'+crypto.randomUUID():selected;const next=selected&&!duplicate?rows.map(row=>row.id===selected?{...offer,id}:row):[...rows,{...offer,id}];if(next.length>50)throw Error('Höchstens 50 Entwürfe. Exportiere vorhandene Entwürfe zuerst.');if(!persist(next))return;fill({...offer,id});status(storage?'Entwurf in dieser Browsersitzung gespeichert. Noch nicht veröffentlicht.':'Entwurf im Arbeitsspeicher abgelegt. Bitte vor dem Neuladen exportieren.');}catch(error){status(error.message);}}
form.addEventListener('submit',event=>{event.preventDefault();commit();});
form.addEventListener('input',()=>{dirty=true;previewPrice();$('offer-preview').hidden=true;});
form.addEventListener('change',()=>{dirty=true;syncKind();previewPrice();$('offer-preview').hidden=true;});
$('new-offer').onclick=()=>{if(!leaveEditor())return;fill();form.elements.title.focus();status('Neuer Angebotsentwurf.');};
$('duplicate-offer').onclick=()=>commit({duplicate:true});
$('delete-offer').onclick=()=>{const row=rows.find(r=>r.id===selected);if(!row||!window.confirm(`Entwurf „${row.title}“ aus dieser Sitzung löschen?`))return;if(persist(rows.filter(r=>r.id!==selected))){fill();status('Entwurf gelöscht.');}};
$('offer-search').oninput=renderList;
$('preview-offer').onclick=()=>{if(!form.reportValidity())return;try{const row=read(),box=$('preview-content');box.replaceChildren(element('h3',row.title),element('p',row.category+' · Entwurf'),element('p',row.description),element('p',`${money(row.netCents)} netto · ${row.tax==='review'?'Steuer noch zu prüfen':row.tax+' % MwSt.'}`),element('p',row.kind==='physical'?`Bestand: ${row.stock}\n${row.delivery}`:row.fulfilment));if(row.sku)box.append(element('p','Artikelnummer: '+row.sku));if(row.gtin)box.append(element('p','GTIN: '+row.gtin));$('offer-preview').hidden=false;$('offer-preview').scrollIntoView({behavior:'smooth',block:'start'});status('Vorschau aus den aktuellen Formularangaben. Noch nicht veröffentlicht.');}catch(error){status(error.message);}};
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
window.addEventListener('beforeunload' ,event=>{if(dirty){event.preventDefault();event.returnValue='';}});
fill();
