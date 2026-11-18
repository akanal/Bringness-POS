(()=>{
 const q=new URLSearchParams(location.search);
 if(document.documentElement.dataset.bringnessEdition==='download'||q.get('desktop')==='1'||q.get('edition')==='download'||window.offlinePOS)return;
 const photo=window.BringnessProductPhoto;if(!photo)return;
 const style=document.createElement('link');style.rel='stylesheet';style.href='/pos/product-photos.css?v=20261118';document.head.append(style);
 document.addEventListener('error',e=>{const img=e.target;if(img instanceof HTMLImageElement&&img.closest('#products .pic'))img.replaceWith(document.createTextNode('🍽️'));},true);
 let config,dialog=null,closeEditor=null,draft=null,draftContext=null,reading=false,readVersion=0,creating=false;
 const form=document.getElementById('productForm');if(!form)return;
 const section=document.createElement('div');section.className='product-photo-draft';
 section.innerHTML='<label>Artikelfoto auswählen (JPEG, PNG oder WebP bis 8 MB)<input id="productPhotoFile" type="file" accept="image/jpeg,image/png,image/webp"></label><img class="product-photo-preview" id="productPhotoPreview" alt="Vorschau des neuen Artikelfotos" hidden><button type="button" id="productPhotoClear" hidden>Fotoauswahl entfernen</button><p id="productPhotoStatus" role="status"></p>';
 form.insertBefore(section,document.getElementById('productEmoji'));const file=section.querySelector('input'),preview=section.querySelector('img'),clear=section.querySelector('button'),status=section.querySelector('p');
 const context=()=>config?.context();
 const same=s=>{const c=context();try{return !!s?.session&&c?.session===s.session&&c?.restaurantId===s.restaurantId&&localStorage.getItem('bringness-pos-token')===s.session;}catch{return false;}};
 function reset(){++readVersion;reading=false;draft=null;draftContext=null;file.value='';preview.hidden=true;preview.removeAttribute('src');clear.hidden=true;status.textContent='';}
 file.onchange=async()=>{
  const selected=file.files[0],version=++readVersion,snapshot=context();draft=null;draftContext=null;preview.hidden=true;clear.hidden=true;reading=Boolean(selected);
  if(!selected){reset();return;}status.textContent='Foto wird vorbereitet…';
  try{const image=await photo.prepare(selected);if(version!==readVersion||!same(snapshot))return;draft=image;draftContext=snapshot;preview.src=image;preview.hidden=false;clear.hidden=false;status.textContent='Foto vorbereitet. Es wird beim Anlegen des Artikels gespeichert.';}
  catch(e){if(version===readVersion){file.value='';status.textContent=e.message;}}
  finally{if(version===readVersion)reading=false;}
 };
 clear.onclick=reset;
 function leave(){reset();closeEditor?.(true);}
 document.getElementById('restaurant')?.addEventListener('change',leave);
 window.addEventListener('storage',e=>{if(e.key==='bringness-pos-token')leave();});window.addEventListener('pagehide',leave);
 document.addEventListener('bringness:pos-view',()=>{closeEditor?.(true);});
 async function request(id,snapshot,options={}){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);
  try{const r=await fetch('/api/v1/products/'+encodeURIComponent(id)+'/image'+(options.method?'':'?restaurantId='+encodeURIComponent(snapshot.restaurantId)),{...options,signal:controller.signal,cache:'no-store',headers:{'content-type':'application/json',authorization:'Bearer '+snapshot.session}});const d=await r.json();if(!r.ok)throw Object.assign(Error(d.error||'Das Foto konnte nicht geladen werden.'),{status:r.status});if(d.id!==id||d.restaurantId!==snapshot.restaurantId||!/^[a-f0-9]{64}$/.test(d.version||''))throw Error('Unvollständige Bildantwort. Bitte erneut laden.');return d;}finally{clearTimeout(timer);}
 }
 async function open(id){
  if(!config)return;closeEditor?.(true);const snapshot=context(),product=config.product(id);if(!product||!same(snapshot))return;
  const opener=document.activeElement,box=document.createElement('dialog');dialog=box;box.className='product-photo-dialog';box.setAttribute('aria-label','Artikelfoto bearbeiten');
  box.innerHTML='<h3></h3><img class="product-photo-preview" alt="Vorschau des Artikelfotos" hidden><p data-empty>Kein Artikelfoto gespeichert.</p><label>Foto auswählen (bis 8 MB)<input type="file" accept="image/jpeg,image/png,image/webp" disabled></label><p>Das Bild wird automatisch verkleinert. Gespeichert wird erst mit „Foto speichern“.</p><div class="product-photo-actions"><button type="button" data-remove disabled>Foto entfernen</button><button type="button" data-save disabled>Foto speichern</button><button type="button" data-reload>Neu laden</button><button type="button" data-close>Schließen</button></div><p role="status">Foto wird geladen…</p>';
  box.querySelector('h3').textContent=product.name+' · Artikelfoto';document.body.append(box);
  const input=box.querySelector('input'),img=box.querySelector('img'),empty=box.querySelector('[data-empty]'),notice=box.querySelector('[role=status]'),save=box.querySelector('[data-save]'),remove=box.querySelector('[data-remove]'),reload=box.querySelector('[data-reload]');
  let current=null,selected=null,dirty=false,busy=false,pending=null,read=0;
  const valid=()=>box.isConnected&&same(snapshot);
  const controls=()=>{input.disabled=!current||busy||!!pending;remove.disabled=!current||busy||!!pending;save.disabled=!current||busy||(!dirty&&!pending);reload.disabled=busy;};
  function display(){const src=photo.source(selected);img.hidden=!src;if(src)img.src=src;else img.removeAttribute('src');empty.hidden=Boolean(src);controls();}
  const close=(force=false)=>{if(!force&&(busy||pending||dirty)&&!confirm('Fotoänderung verwerfen? Bei unklarem Speicherstatus das Foto danach neu laden.'))return;read++;box.close();box.remove();if(dialog===box){dialog=null;closeEditor=null;}if(opener?.isConnected)opener.focus();};closeEditor=close;
  box.querySelector('[data-close]').onclick=()=>close();box.addEventListener('cancel',e=>{e.preventDefault();close();});box.showModal();
  async function load(){
   if(!valid())return;if(dirty&&!confirm('Ungespeicherte Fotoänderung verwerfen und den gespeicherten Stand laden?'))return;
   busy=true;controls();notice.textContent='Foto wird geladen…';try{const d=await request(id,snapshot);if(!valid())return;current=d;selected=d.image;dirty=false;pending=null;save.textContent='Foto speichern';display();notice.textContent='';}catch(e){if(valid())notice.textContent=e.message;}finally{busy=false;if(valid())controls();}
  }
  reload.onclick=load;
  input.onchange=async()=>{
   const f=input.files[0];if(!f)return;const version=++read;busy=true;controls();notice.textContent='Foto wird vorbereitet…';
   try{const value=await photo.prepare(f);if(!valid()||version!==read)return;selected=value;dirty=true;display();notice.textContent='Vorschau bereit. Bitte Foto speichern.';}
   catch(e){if(valid()&&version===read)notice.textContent=e.message;}
   finally{if(version===read){busy=false;if(valid())controls();}}
  };
  remove.onclick=()=>{selected=null;dirty=true;input.value='';display();notice.textContent='Das Foto wird erst mit „Foto speichern“ entfernt.';};
  save.onclick=async()=>{
   if(busy||!current||!valid()||(!dirty&&!pending))return;
   pending??={restaurantId:snapshot.restaurantId,expectedVersion:current.version,image:selected};busy=true;controls();notice.textContent='Foto wird gespeichert…';
   try{const d=await request(id,snapshot,{method:'PUT',body:JSON.stringify(pending)});if(!valid())return;current=d;selected=d.image;dirty=false;pending=null;input.value='';config.saved(id,d.image);display();notice.textContent='Artikelfoto gespeichert.';save.textContent='Foto speichern';}
   catch(e){if(valid()){if(e.status&&e.status<500){pending=null;notice.textContent=e.message;}else{notice.textContent='Speicherstatus unklar. Bitte denselben Vorgang erneut prüfen oder den gespeicherten Stand neu laden.';save.textContent='Speicherung erneut prüfen';}}}
   finally{busy=false;if(valid())controls();}
  };
  await load();
 }
 window.bnProductPhotos={
  connect(value){config=value;const original=form.onsubmit;form.onsubmit=async e=>{if(creating||reading){e.preventDefault();if(reading)status.textContent='Bitte warten, bis das Foto vorbereitet ist.';return;}creating=true;const button=e.submitter||form.querySelector('button:not([type="button"])');if(button)button.disabled=true;try{await original(e);}finally{creating=false;if(button?.isConnected)button.disabled=false;}};},
  newImage(){if(reading)throw Error('Foto wird noch vorbereitet.');if(draft&&!same(draftContext))throw Error('Betrieb oder Anmeldung geändert. Bitte Foto erneut auswählen.');return draft;},
  created:reset,open
 };
})();
