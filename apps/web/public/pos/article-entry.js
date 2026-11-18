(()=>{
 const q=new URLSearchParams(location.search);if(document.documentElement.dataset.bringnessEdition==='download'||q.get('desktop')==='1'||q.get('edition')==='download'||window.offlinePOS)return;
 const form=document.getElementById('productForm');if(!form)return;
 let config,generation=0,selected='',busy=false,ready=false,pending=null,uncertain=false,catalog=null,oldDeposit=null,baseline=null;
 const $=s=>form.querySelector(s),node=(tag,text)=>{const n=document.createElement(tag);if(text)n.textContent=text;return n;};
 const style=document.createElement('link');style.rel='stylesheet';style.href='/pos/article-entry.css?v=20261118';document.head.append(style);
 const picker=node('label','Artikel auswählen'),select=node('select');select.id='articleEntrySelect';picker.append(select);form.prepend(picker);
 const draftPhoto=form.querySelector('.product-photo-draft');if(draftPhoto)document.getElementById('productName').after(draftPhoto);
 const photoHost=node('section');photoHost.id='articleEntryPhoto';form.append(photoHost);
 const extra=node('div');extra.className='article-entry-extra';extra.innerHTML='<details><summary>Getränkepfand</summary><label><input type="checkbox" data-deposit-enabled> Pfand für dieses Getränk</label><div data-deposit-fields><label>Pfand je Verkaufsartikel (€)<input data-deposit-amount inputmode="decimal" value="0,25"></label><label>Pfand-Steuersatz<select data-deposit-tax><option value="">Bitte auswählen</option><option value="19">19 %</option><option value="7">7 %</option><option value="0">0 %</option></select></label></div><small>Zusätzlich zum Getränkepreis. Bestehende Pfandeinheiten bleiben erhalten.</small></details><details><summary>Allergene &amp; Zusatzstoffe</summary><div data-labels>Angaben werden geladen…</div></details><details><summary>Verfügbarkeit</summary><label><input type="checkbox" data-av-enabled> Zeit-/Saisonregel aktiv</label><div class="article-entry-grid"><label>Uhrzeit von<input data-av-startTime placeholder="HH:MM" maxlength="5"></label><label>Uhrzeit bis<input data-av-endTime placeholder="HH:MM" maxlength="5"></label><label>Datum von<input data-av-startDate type="date"></label><label>Datum bis<input data-av-endDate type="date"></label></div><small>Berliner Zeit; jahresübergreifende Saison möglich. Leere Felder begrenzen nicht.</small></details>';
 form.append(extra);const message=node('p');message.id='articleEntryStatus';message.setAttribute('role','status');form.append(message);const reset=node('button','Neuer Artikel / Auswahl zurücksetzen');reset.type='button';form.append(reset);
 const submit=form.querySelector('button:not([type="button"])');form.append(submit);
 const basic=['productName','productPrice','productCategory','tax','productDescription','productIngredients','productEmoji'];
 const snapshot=()=>({...config.context(),id:selected}),same=s=>{const c=config.context();return s.generation===generation&&s.session===c.session&&s.restaurantId===c.restaurantId&&s.id===selected&&localStorage.getItem('bringness-pos-token')===s.session;};
 const controls=()=>{[...extra.querySelectorAll('input,select,button'),...form.querySelectorAll('.product-photo-draft input,.product-photo-draft button'),select,submit].forEach(n=>n.disabled=busy||uncertain||!!pending);select.disabled=busy||uncertain||!!pending;reset.disabled=busy;submit.disabled=busy||uncertain||!ready;basic.forEach(id=>{document.getElementById(id).disabled=!!selected||busy||uncertain||!!pending;});if(!busy&&!pending&&!uncertain){$('[data-deposit-fields]').hidden=!$('[data-deposit-enabled]').checked;}}
 const status=t=>message.textContent=t;
 function labels(values={allergens:[],additives:[]}){const host=$('[data-labels]');host.replaceChildren();for(const [type,title] of [['allergens','Allergene'],['additives','Zusatzstoffe']]){const group=node('fieldset'),legend=node('legend',title);group.append(legend);for(const item of catalog[type]){const l=node('label'),i=node('input');i.type='checkbox';i.dataset.labelType=type;i.value=item.code;i.checked=values[type].includes(item.code);l.append(i,document.createTextNode(item.name));group.append(l);}host.append(group);}}
 const avKeys=['startTime','endTime','startDate','endDate'];
 async function choose(id=''){
  if(busy||pending||uncertain)return;selected=id;select.value=id;const s={...snapshot(),generation:++generation};ready=false;status('Artikelangaben werden geladen…');controls();photoHost.replaceChildren();window.bnProductPhotos?.created();
  const p=config.products().find(p=>p.id===id),draft=document.querySelector('.product-photo-draft');if(draft)draft.hidden=!!id;
  for(const field of basic){const n=document.getElementById(field);if(field==='productName')n.value=p?.name||'';if(field==='productPrice')n.value=p?String(p.price):'';if(field==='productCategory'&&p)n.value=p.categoryId;if(field==='productEmoji')n.value='🍽️';if(field==='tax')n.value=String(p?.tax??19);if(['productDescription','productIngredients'].includes(field))n.value='';}
  submit.textContent=id?'Artikelangaben speichern':'Produkt hinzufügen';
  try{
   catalog??=await config.api('/product-labels');if(!Array.isArray(catalog.allergens)||!Array.isArray(catalog.additives))throw Error('Allergen-Katalog konnte nicht geladen werden.');
   const [markings,translations,deposits]=id?await Promise.all([config.api('/products/'+id+'/labels'),config.api('/products/'+id+'/translations'),config.api('/deposit/rules?restaurantId='+encodeURIComponent(s.restaurantId))]):[{allergens:[],additives:[]},{translations:[]},{rules:[]}];if(!same(s))return;
   labels(markings);oldDeposit=deposits.rules.find(r=>r.product_id===id);$('[data-deposit-enabled]').checked=!!oldDeposit;$('[data-deposit-amount]').value=oldDeposit?String(oldDeposit.amount_cents/100).replace('.',','):'0,25';$('[data-deposit-tax]').value=oldDeposit?String(oldDeposit.tax_rate):'';
   const stored=translations.translations?.find(t=>t.languageCode==='avl');let av={enabled:false};if(stored?.allergens){try{av=JSON.parse(stored.allergens)}catch{throw Error('Gespeicherte Verfügbarkeit ist unlesbar. Bitte den Stand prüfen.');}}
   $('[data-av-enabled]').checked=!!av.enabled;for(const k of avKeys)$('[data-av-'+k+']').value=av[k]||'';
   baseline=values();ready=true;status(id?'Stammdaten bleiben erhalten. Foto und zusätzliche Angaben hier bearbeiten.':'Foto und zusätzliche Angaben werden mit diesem Artikel übernommen.');controls();if(id)await window.bnProductPhotos?.open(id,photoHost);
  }catch(e){if(same(s)){status(e.message+' Bitte Auswahl erneut laden.');controls();}}
 }
 function values(){
  const enabled=$('[data-deposit-enabled]').checked,text=$('[data-deposit-amount]').value.trim().replace(',','.');if(enabled&&(!/^\d+(?:\.\d{1,2})?$/.test(text)||Number(text)<=0||Number(text)>10000))throw Error('Gültigen Pfandbetrag größer als 0 eingeben.');if(enabled&&!$('[data-deposit-tax]').value)throw Error('Pfand-Steuersatz auswählen.');
  const availability={enabled:$('[data-av-enabled]').checked};for(const k of avKeys)availability[k]=$('[data-av-'+k+']').value.trim();for(const k of ['startTime','endTime'])if(availability[k]&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(availability[k]))throw Error('Uhrzeiten im Format HH:MM eingeben.');
  return {labels:Object.fromEntries(['allergens','additives'].map(type=>[type,[...form.querySelectorAll('[data-label-type="'+type+'"]:checked')].map(n=>n.value)])),availability,deposit:{label:oldDeposit?.label||'Getränkepfand',amountCents:enabled?Math.round(Number(text)*100):0,units:oldDeposit?.units||1,taxRate:enabled?Number($('[data-deposit-tax]').value):Number(oldDeposit?.tax_rate||0)},description:document.getElementById('productDescription').value.trim(),ingredients:document.getElementById('productIngredients').value.trim()};
 }
 async function submitEntry(e){
  e.preventDefault();if(busy||uncertain||!ready)return;const s={...snapshot(),generation};if(!same(s)){status('Anmeldung oder Betrieb geändert. Bitte die Seite neu laden.');return;}busy=true;controls();
  try{
   if(!pending){const v=values();let id=selected;
    if(!id){const name=document.getElementById('productName').value.trim(),price=Number(document.getElementById('productPrice').value),categoryId=document.getElementById('productCategory').value;if(!name||!categoryId||!Number.isFinite(price)||price<0)throw Error('Bitte Artikelname, Kategorie und gültigen Preis eingeben.');const emoji=window.bnProductPhotos?.newImage()||document.getElementById('productEmoji').value;
     try{const created=await config.api('/products',{method:'POST',body:JSON.stringify({restaurantId:s.restaurantId,categoryId,name,price,tax:document.getElementById('tax').value,emoji})});id=created.id;if(!id)throw Error('Artikelantwort unvollständig.');}catch(error){if(!error.status||error.status>=500){uncertain=true;throw Error('Anlegestatus unklar. Bitte die Artikelliste neu laden und prüfen, bevor du denselben Artikel erneut anlegst.');}throw error;}
    }
    if(!same(s))return;pending={id,restaurantId:s.restaurantId,steps:[],done:0};
    if(JSON.stringify(v.labels)!==JSON.stringify(baseline.labels))pending.steps.push(['/products/'+id+'/labels',v.labels]);
    if(JSON.stringify(v.availability)!==JSON.stringify(baseline.availability))pending.steps.push(['/products/'+id+'/translations',{languageCode:'avl',description:'Bringness availability rule',ingredients:'',allergens:JSON.stringify(v.availability)}]);
    if(JSON.stringify(v.deposit)!==JSON.stringify(baseline.deposit))pending.steps.push(['/deposit/rules',{...v.deposit,restaurantId:s.restaurantId,productId:id}]);
    if(!selected&&(v.description||v.ingredients))pending.steps.push(['/products/'+id+'/translations',{languageCode:'de',description:v.description,ingredients:v.ingredients}]);
   }
   while(pending.done<pending.steps.length){if(!same(s))return;const [path,body]=pending.steps[pending.done];await config.api(path,{method:'PUT',body:JSON.stringify(body)});pending.done++;}
   if(!same(s))return;baseline=values();const wasNew=!selected;pending=null;window.bnProductPhotos?.created();submit.textContent=selected?'Artikelangaben speichern':'Produkt hinzufügen';status('Artikelangaben gespeichert.');await config.reload(s.restaurantId);if(!same(s))return;if(wasNew){busy=false;refresh();await choose('');status('Artikel mit Foto und zusätzlichen Angaben gespeichert.');}
  }catch(error){if(same(s)){status(pending?'Artikel ist angelegt beziehungsweise vorhanden. Zusätzliche Angaben noch nicht vollständig gespeichert: '+error.message+' Mit „Speicherung fortsetzen“ erneut prüfen.':error.message);if(pending)submit.textContent='Speicherung fortsetzen';}}
  finally{busy=false;if(same(s))controls();}
 }
 function refresh(){const previous=selected;select.replaceChildren();const n=node('option','Neuen Artikel anlegen');n.value='';select.append(n);for(const p of config.products().filter(p=>p.restaurantId===config.context().restaurantId)){const o=node('option',p.name);o.value=p.id;select.append(o);}select.value=previous;}
 select.onchange=()=>choose(select.value);$('[data-deposit-enabled]').onchange=controls;reset.onclick=()=>{if(pending||uncertain){status('Bitte zuerst den gespeicherten Stand über Neuladen der Seite prüfen. Die Eingaben bleiben bis dahin erhalten.');return;}choose('');};
 document.getElementById('restaurant')?.addEventListener('change',()=>{generation++;pending=null;uncertain=false;busy=false;selected='';ready=false;refresh();choose('');});
 document.addEventListener('bringness:pos-view',e=>{if(e.detail?.view==='artikel'&&!busy&&!pending&&!uncertain){refresh();choose(selected);}});
 window.bnArticleEntry={connect(value){config=value;refresh();},submit:submitEntry,open:async id=>{if(pending||busy||uncertain){status('Bitte die laufende Speicherung zuerst abschließen.');return;}await config.openView();refresh();await choose(id);}};
})();
