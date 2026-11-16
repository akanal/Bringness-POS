// Fixed support categories only. Never retain paths, request bodies or raw errors.
(()=>{
 'use strict';
 if(window.bnPosDiagnostics)return;
 const version='pos-diagnostics-admin-20261116',scopes=new Set(['LOGIN','REGISTER','RESET','LOAD','SAVE','CONNECTION','START','DISPLAY','PERSONNEL','CATALOG','TAX','AVAILABILITY','STOCK','TRADE']);
 const kinds=new Set(['NETWORK','TIMEOUT','RESPONSE','AUTH','ACCESS','LIMIT','SERVER','REQUEST','STORAGE','FAILED']);
 let last=null,panel=null,copy=null,output=null,status=null;
 function clear(){last=null;panel?.remove();panel=null;copy=output=status=null;}
 function mount(){
  if(panel?.isConnected)return;
  panel=document.createElement('section');panel.id='posDiagnostic';panel.className='pos-diagnostic';panel.setAttribute('aria-label','Fehlerdiagnose');
  status=document.createElement('p');status.setAttribute('role','status');
  copy=document.createElement('button');copy.type='button';copy.textContent='Fehlerdiagnose kopieren';
  output=document.createElement('textarea');output.readOnly=true;output.hidden=true;output.setAttribute('aria-label','Fehlerdiagnose zum Kopieren');
  const close=document.createElement('button');close.type='button';close.textContent='Schließen';close.onclick=clear;
  copy.onclick=async()=>{
   const snapshot=last;if(!snapshot)return;const text=JSON.stringify(snapshot,null,2);
   try{if(!navigator.clipboard?.writeText)throw Error();await navigator.clipboard.writeText(text);if(last===snapshot)status.textContent='Fehlercode: '+snapshot.code+'. Diagnose kopiert. Du kannst sie an Bringness weitergeben.';}
   catch{if(last!==snapshot)return;output.value=text;output.hidden=false;output.focus();output.select();status.textContent='Fehlercode: '+snapshot.code+'. Bitte den markierten Diagnosetext manuell kopieren.';}
  };
  panel.append(status,copy,close,output);const anchor=document.getElementById('auth')||document.getElementById('status');if(anchor?.parentNode)anchor.parentNode.insertBefore(panel,anchor);else document.body.append(panel);
 }
 function report(scope,kind='FAILED'){
  scope=scopes.has(scope)?scope:'LOAD';kind=kinds.has(kind)?kind:'FAILED';
  const code='POS-'+scope+'-'+kind;
  try{
   const record=Object.freeze({code,time:new Date().toISOString(),version,online:navigator.onLine===true});
   try{window.bnPosDiagnosticDelivery?.enqueue(record);}catch{}
   // Report background faults without replacing a specific action's local diagnosis.
   if(scope==='CONNECTION'&&last&&!last.code.startsWith('POS-CONNECTION-'))return code;
   last=record;
   mount();output.hidden=true;output.value='';status.textContent='Fehlercode: '+code+'. Bitte bei Rückfragen angeben.';
  }catch{/* Diagnostics must never prevent a business action from completing. */}
  return code;
 }
 function classify(error){
  if(kinds.has(error?.diagnosticKind))return error.diagnosticKind;
  const status=Number(error?.status);
  if(status===401)return 'AUTH';if(status===403)return 'ACCESS';if(status===408||status===504)return 'TIMEOUT';
  if(status===429)return 'LIMIT';if(status>=500&&status<=599)return 'SERVER';if(status>=400&&status<=499)return 'REQUEST';
  return 'FAILED';
 }
 function decorate(error,scope){
  if(error?.diagnosticCode)return error;
  const result=error instanceof Error?error:Error('Anfrage fehlgeschlagen.');
  const code=report(scope,classify(error));result.diagnosticCode=code;
  result.message+=' ['+code+']';return result;
 }
 const context=()=>{try{return localStorage.getItem('bringness-pos-token')+'|'+(document.getElementById('restaurant')?.value||'');}catch{return null;}};
 // Opt-in JSON requests for independent modules. No retries, persistence or new timeouts.
 async function jsonRequest(scope,url,options={}){
  const initial=context(),writing=!['GET','HEAD'].includes(String(options.method||'GET').toUpperCase());
  try{
   let response;
   try{response=await window.fetch(url,options);}catch(error){throw Object.assign(Error(['AbortError','TimeoutError'].includes(error?.name)?'Die Anfrage wurde unterbrochen.':'Verbindung zum Server fehlgeschlagen.'),{diagnosticKind:['AbortError','TimeoutError'].includes(error?.name)?'TIMEOUT':'NETWORK'});}
   let data;
   try{data=await response.json();}catch{throw Object.assign(Error('Die Serverantwort ist unvollständig.'),{status:response.status,diagnosticKind:response.ok?'RESPONSE':undefined});}
   if(!data||typeof data!=='object'||Array.isArray(data))throw Object.assign(Error('Die Serverantwort ist unvollständig.'),{status:response.status,diagnosticKind:response.ok?'RESPONSE':undefined});
   if(!response.ok)throw Object.assign(Error(typeof data.error==='string'?data.error:'Anfrage fehlgeschlagen.'),{status:response.status,code:data.code,retryAfter:data.retryAfter});
   return data;
  }catch(error){
   // A missing response never proves that a write was rolled back.
   if(writing&&(['NETWORK','TIMEOUT','RESPONSE'].includes(error.diagnosticKind)||error.status>=500))error.message+=' Der Speicherstatus ist unklar. Bitte zuerst den vorhandenen Vorgang abgleichen; nicht als neuen Vorgang wiederholen.';
   if(initial===null||context()!==initial)throw error;
   throw decorate(error,scope);
  }
 }
 // Read-only PDF transport. The caller still owns authorization, display and object URLs.
 async function pdfRequest(scope,url,options={}){
  const initial=context();
  try{
   let response;
   try{response=await window.fetch(url,options);}catch(error){throw Object.assign(Error(['AbortError','TimeoutError'].includes(error?.name)?'Die Anfrage wurde unterbrochen.':'Verbindung zum Server fehlgeschlagen.'),{diagnosticKind:['AbortError','TimeoutError'].includes(error?.name)?'TIMEOUT':'NETWORK'});}
   if(!response.ok){let data;try{data=await response.json();}catch{}throw Object.assign(Error(typeof data?.error==='string'?data.error:'Gespeichertes PDF nicht verfügbar.'),{status:response.status,code:data?.code,retryAfter:data?.retryAfter});}
   let blob;try{blob=await response.blob();}catch(error){throw Object.assign(Error('Die PDF-Antwort ist unvollständig.'),{diagnosticKind:['AbortError','TimeoutError'].includes(error?.name)?'TIMEOUT':'RESPONSE'});}
   if(!blob||!blob.size||String(blob.type).split(';')[0].toLowerCase()!=='application/pdf')throw Object.assign(Error('Die Serverantwort ist kein vollständiges PDF.'),{diagnosticKind:'RESPONSE'});
   return blob;
  }catch(error){if(initial===null||context()!==initial)throw error;throw decorate(error,scope);}
 }
 window.bnPosDiagnostics={report,decorate,clear,jsonRequest,pdfRequest};
 window.addEventListener('pagehide',clear);
 window.addEventListener('storage',event=>{if(event.key===null||event.key==='bringness-pos-token')clear();});
 document.getElementById('restaurant')?.addEventListener('change',clear);
})();
