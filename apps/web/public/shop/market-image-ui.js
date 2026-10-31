export function mountMarketImage({window:w,host}){
 const d=host.ownerDocument,el=(tag,text)=>{const e=d.createElement(tag);if(text!==undefined)e.textContent=text;return e;};
 const title=el('h3','Produktbild'),note=el('p','PNG oder JPEG, höchstens 5 MiB. Das Bild wird neu kodiert. Bei veröffentlichten Angeboten ist es anschließend öffentlich sichtbar.'),input=el('input'),upload=el('button','Bild hochladen / Anfrage wiederholen'),remove=el('button','Produktbild entfernen'),load=el('button','Bildstand neu laden'),status=el('p','Zuerst ein Angebot laden.');
 input.type='file';input.accept='image/png,image/jpeg';input.setAttribute('aria-label','Produktbild auswählen');status.setAttribute('role','status');for(const b of [upload,remove,load])b.type='button';host.append(title,note,input,upload,remove,load,status);
 let offer=null,revision=null,epoch=0,busy=false,pending=null,account=null;
 const token=()=>w.localStorage.getItem('bringness-pos-token');
 const update=()=>{upload.disabled=busy||!offer||revision===null;remove.disabled=busy||!offer||!revision;load.disabled=busy||!offer;input.disabled=busy||!offer;};
 function privacy(){epoch++;offer=null;revision=null;pending=null;account=null;input.value='';status.textContent='Private Bildverwaltung geschlossen. Angebot erneut laden.';update();}
 async function request(path,options={}){
  const original=token();if(!original)throw Error('Bitte anmelden.');
  const r=await w.fetch('/api/v1/shop/marketplace/images/'+encodeURIComponent(offer)+path,{...options,headers:{Authorization:'Bearer '+original,...options.headers},cache:'no-store',credentials:'omit',redirect:'error'});
  const result=await r.json();if(original!==token())throw Error('Konto gewechselt.');if(!r.ok)throw Error(result.code==='REVISION_CONFLICT'?'Bildstand hat sich geändert. Bitte neu laden.':result.code==='IMAGE_STORAGE_UNAVAILABLE'?'Bildspeicher ist noch nicht verfügbar.':'Bildanfrage fehlgeschlagen ('+(result.code||'unbekannt')+').');
  if(result.offerId!==offer||!Number.isSafeInteger(result.revision)||result.revision<0)throw Error('Ungültige Bildantwort.');return result;
 }
 async function act(fn){if(busy||!offer||d.hidden)return;const start=epoch,original=token();busy=true;update();try{const r=await fn();if(start!==epoch||original!==token()||d.hidden)return;revision=r.revision;status.textContent=r.imageId?'Produktbild gespeichert. Bei veröffentlichtem Angebot öffentlich sichtbar.':'Kein Produktbild zugeordnet.';}catch(e){if(start===epoch&&original===token())status.textContent=e.message;}finally{busy=false;update();}}
 function setOffer(id){epoch++;offer=id;revision=null;pending=null;account=token();input.value='';status.textContent=id?'Bildstand wird geladen.':'Zuerst ein Angebot laden.';update();if(id)act(()=>request(''));}
 load.addEventListener('click',()=>act(()=>request('')));
 input.addEventListener('change',()=>{pending=null;});
 upload.addEventListener('click',()=>{
  if(!input.files?.length||revision===null)return;const file=input.files[0];if(!['image/png','image/jpeg'].includes(file.type)||file.size>5*1024*1024){status.textContent='Bitte PNG oder JPEG mit höchstens 5 MiB wählen.';return;}
  if(!pending){if(!w.confirm('Dieses Produktbild bei veröffentlichtem Angebot öffentlich anzeigen? Bitte nur Bilder mit entsprechenden Nutzungsrechten verwenden.'))return;pending={id:w.crypto.randomUUID(),revision,file};}
  const command=pending;act(async()=>{const r=await request('',{method:'POST',headers:{'Content-Type':command.file.type,'X-Image-Id':command.id,'X-Image-Revision':String(command.revision)},body:command.file});if(pending===command)pending=null;return r;});
 });
 remove.addEventListener('click',()=>{if(revision&&w.confirm('Die öffentliche Bildzuordnung entfernen?'))act(async()=>{const r=await request('/remove',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({expectedRevision:revision})});pending=null;return r;});});
 w.addEventListener('pagehide',privacy);w.addEventListener('offline',privacy);w.addEventListener('storage',e=>{if(e.key===null||e.key==='bringness-pos-token')privacy();});w.addEventListener('focus',()=>{if(account!==null&&account!==token())privacy();});d.addEventListener('visibilitychange',()=>{if(d.hidden)privacy();});update();return {setOffer,privacy};
}
