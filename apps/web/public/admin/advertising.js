import {safeLink} from '/bestellen/advertising-view.js';
const $=id=>document.getElementById(id),session=localStorage.getItem('bringness-pos-token');
const fields=$('editor').elements;
let entries=[],selected=null,image='',busy=false,pending=null;
const current=()=>session&&localStorage.getItem('bringness-pos-token')===session;
function clear(){entries=[];image='';pending=null;$('workspace').hidden=true;$('ads').replaceChildren();$('editor').reset();$('previewImage').removeAttribute('src');$('notice').textContent='Bitte erneut in der Verwaltung anmelden.';$('login').hidden=false;}
async function api(options={}){
  if(!current()){clear();throw Error('Bitte anmelden.');}
  const response=await fetch('/api/v1/platform/advertising',{...options,headers:{authorization:'Bearer '+session,'content-type':'application/json'},cache:'no-store'});
  if(!current()){clear();throw Error('Anmeldung geändert.');}
  const data=await response.json();
  if(!response.ok){if([401,403].includes(response.status))clear();throw Object.assign(Error(data.error||'Anfrage nicht bestätigt.'),{status:response.status});}
  return data;
}
function controls(){ $('fields').disabled=busy||!!pending;$('ads').disabled=busy;$('new').disabled=busy;$('reload').disabled=busy; }
function preview(){
  $('previewTitle').textContent=fields.title.value||'Überschrift';$('previewCaption').textContent=fields.caption.value;
  if(image)$('previewImage').src=image;else $('previewImage').removeAttribute('src');
}
function localTime(value){if(!value)return '';const d=new Date(value);return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);}
function edit(ad){
  selected=ad||{id:crypto.randomUUID(),version:0};pending=null;image=ad?.image||'';$('editor').reset();
  for(const name of ['title','caption','link'])fields[name].value=ad?.[name]||'';
  fields.position.value=ad?.position??0;fields.active.checked=ad?.active===true;
  for(const name of ['startsAt','endsAt'])fields[name].value=localTime(ad?.[name]);
  preview();controls();
}
async function load(){
  busy=true;controls();try{
    const data=await api();entries=data.advertisements;$('ads').replaceChildren(new Option('Neue Anzeige',''),...entries.map(ad=>new Option((ad.active?'Aktiv':'Pausiert')+' · '+ad.title,ad.id)));
    $('workspace').hidden=false;$('login').hidden=true;edit();$('notice').textContent='Gespeicherten Stand geladen.';
  }catch(e){$('notice').textContent=e.message;}finally{busy=false;controls();}
}
$('new').onclick=()=>{if(pending&&!confirm('Speicherstatus ist unklar. Zuerst den gespeicherten Stand laden?'))return;if(pending){void load();return;}$('ads').value='';edit();};
$('ads').onchange=()=>{if(pending){$('notice').textContent='Zuerst den gespeicherten Stand laden und abgleichen.';return;}edit(entries.find(ad=>ad.id===$('ads').value));};
$('reload').onclick=()=>{if(confirm('Ungespeicherte Änderungen verwerfen und gespeicherten Stand laden?'))void load();};
$('viewport').onchange=()=>{$('preview').className=$('viewport').value;};
$('editor').addEventListener('input',preview);
$('file').onchange=async()=>{
  const file=$('file').files[0];if(!file)return;busy=true;controls();
  try{
    if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>5*1024*1024)throw Error('Bitte ein PNG-, JPEG- oder WebP-Bild bis 5 MB auswählen.');
    const bitmap=await createImageBitmap(file);try{
      if(bitmap.width*bitmap.height>24000000)throw Error('Bild ist zu groß. Bitte vorab verkleinern.');
      const scale=Math.min(1,1200/Math.max(bitmap.width,bitmap.height));const canvas=document.createElement('canvas');
      canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);
      const result=canvas.toDataURL('image/webp',.82);if(result.length>1400000)throw Error('Bitte ein kleineres Bild auswählen.');
      if(!current()){clear();return;}image=result;preview();$('notice').textContent='Bild vorbereitet. Zum Übernehmen Anzeige speichern.';
    }finally{bitmap.close();}
  }catch(e){$('notice').textContent=e.message;}finally{busy=false;controls();}
};
$('editor').onsubmit=async event=>{
  event.preventDefault();if(busy||pending)return;
  if(!image||!safeLink(fields.link.value)){$('notice').textContent='Bitte ein Bild und einen gültigen HTTPS-Link eintragen.';return;}
  const date=name=>fields[name].value?new Date(fields[name].value).toISOString():null;
  pending={id:selected.id,version:selected.version,title:fields.title.value,caption:fields.caption.value,link:fields.link.value,image,position:fields.position.valueAsNumber,active:fields.active.checked,startsAt:date('startsAt'),endsAt:date('endsAt')};
  busy=true;controls();
  try{const data=await api({method:'PUT',body:JSON.stringify(pending)});const ad=data.advertisement;entries=[...entries.filter(item=>item.id!==ad.id),ad];$('ads').replaceChildren(new Option('Neue Anzeige',''),...entries.map(item=>new Option((item.active?'Aktiv':'Pausiert')+' · '+item.title,item.id)));$('ads').value=ad.id;edit(ad);$('notice').textContent='Anzeige gespeichert. '+(ad.active?'Sie erscheint innerhalb des eingestellten Zeitraums.':'Sie ist pausiert.');}
  catch(e){if([400,401,403,409,413].includes(e.status))pending=null;$('notice').textContent=e.message+(pending?' Speicherstatus unklar. Über „Gespeicherten Stand laden“ abgleichen, bevor du weiterarbeitest.':'');}
  finally{busy=false;controls();}
};
addEventListener('storage',()=>{if(!current())clear();});
addEventListener('pageshow',()=>{if(!current())clear();});
void load();
