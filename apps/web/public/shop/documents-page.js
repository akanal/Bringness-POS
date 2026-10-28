import {createDocumentClient,documentMessages} from './documents-client.js';
const $=id=>document.getElementById(id),element=(tag,text)=>{const e=document.createElement(tag);e.textContent=text;return e;};
let pending=null,busy=false,available=false,epoch=0;
const message=(text,error=false)=>{$('documents-message').textContent=text;$('documents-message').classList.toggle('market-error',error);};
const client=createDocumentClient({window,onPrivacy:()=>{epoch++;pending=null;busy=false;$('documents-list').replaceChildren();$('document-file').value='';message('Anmeldung oder Ansicht gewechselt. Dokumente bitte erneut laden.');controls();}});
function controls(){$('document-submit').disabled=busy||!available;$('documents-load').disabled=busy;$('document-file').disabled=busy;}
const sha=async bytes=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
async function download(row){
 if(busy)return;busy=true;const current=epoch;controls();
 try{
  const result=await client.request('/'+row.id,{binary:true});if(current!==epoch)return;
  if(result.bytes.length!==row.bytes||result.sha!==row.sha256||await sha(result.bytes)!==row.sha256)throw Object.assign(Error(),{code:'DOCUMENT_MISMATCH'});
  if(current!==epoch||document.visibilityState==='hidden')return;
  const url=URL.createObjectURL(new Blob([result.bytes],{type:row.mime})),a=element('a','');a.href=url;a.download=row.filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);message('Datei geprüft und Download gestartet.');
 }catch(error){message(documentMessages[error.code]||documentMessages.DOCUMENT_STORAGE_UNAVAILABLE,true);}finally{busy=false;controls();}
}
async function load(){
 const current=epoch;const result=await client.request('');if(current!==epoch)return;
 if(!Array.isArray(result.documents)||result.documents.some(r=>typeof r.filename!=='string'||!/^[a-f0-9-]{36}$/.test(r.id)||!/^[a-f0-9]{64}$/.test(r.sha256)||!Number.isSafeInteger(r.bytes)||r.bytes<8||r.bytes>5242880||!['application/pdf','image/png','image/jpeg'].includes(r.mime)))throw Object.assign(Error(),{code:'DOCUMENT_MISMATCH'});
 $('documents-list').replaceChildren();
 for(const row of result.documents){const box=element('article',''),title=element('h3',row.filename),info=element('p',(row.bytes<1024?row.bytes+' B':(row.bytes/1024).toLocaleString('de-DE',{maximumFractionDigits:1})+' KB')+' · '+new Date(row.createdAt).toLocaleDateString('de-DE')),button=element('button','Herunterladen');button.type='button';button.addEventListener('click',()=>download(row));box.append(title,info,button);$('documents-list').append(box);if(pending?.id===row.id)pending=null;}
 if(!result.documents.length)$('documents-list').append(element('p','Noch keine Kontodokumente gespeichert.'));
}
$('document-file').addEventListener('change',()=>{pending=null;message('');});
$('documents-load').addEventListener('click',async()=>{if(busy)return;busy=true;controls();try{await load();message('Dokumente dieses Firmenkontos geladen.');}catch(error){$('documents-list').replaceChildren();message(documentMessages[error.code]||documentMessages.DOCUMENT_STORAGE_UNAVAILABLE,true);}finally{busy=false;controls();}});
$('document-form').addEventListener('submit',async event=>{
 event.preventDefault();if(busy||!available)return;const file=$('document-file').files[0],current=epoch;
 if(!file||file.size<8||file.size>5242880||!['application/pdf','image/png','image/jpeg'].includes(file.type)){message(documentMessages.INVALID_DOCUMENT,true);return;}
 busy=true;controls();message('Datei wird privat gespeichert und geprüft …');
 try{
  if(!pending||pending.file!==file){const bytes=await file.arrayBuffer();if(current!==epoch)return;pending={id:crypto.randomUUID(),file,bytes};}
  const operation=pending,result=await client.request('',{method:'POST',headers:{'Content-Type':file.type,'X-Document-Name':encodeURIComponent(file.name),'X-Document-Id':operation.id},body:operation.bytes});if(current!==epoch)return;
  if(result.id!==operation.id||result.filename!==file.name||result.bytes!==file.size||result.sha256!==await sha(operation.bytes))throw Object.assign(Error(),{code:'DOCUMENT_MISMATCH'});
  if(current!==epoch)return;pending=null;$('document-file').value='';await load();message('Dokument direkt in IDrive gespeichert und geprüft.');
 }catch(error){message(documentMessages[error.code]||documentMessages.DOCUMENT_UNCERTAIN,true);}finally{busy=false;controls();}
});
try{const status=await client.request('/status',{publicStatus:true});available=status.available===true;message(available?'Dokumentenspeicher bereit. Melde dich an und lade deine Dokumente.':'Der direkte Dokumentenspeicher ist noch nicht verfügbar.');}catch{message(documentMessages.DOCUMENT_STORAGE_UNAVAILABLE,true);}controls();
