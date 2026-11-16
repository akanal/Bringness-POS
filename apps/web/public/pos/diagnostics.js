// Fixed support categories only. Never retain paths, request bodies or raw errors.
(()=>{
 'use strict';
 if(window.bnPosDiagnostics)return;
 const version='pos-diagnostics-20261115',scopes=new Set(['LOGIN','REGISTER','RESET','LOAD','SAVE','CONNECTION','START']);
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
  panel.append(status,copy,close,output);const anchor=document.getElementById('auth');if(anchor?.parentNode)anchor.parentNode.insertBefore(panel,anchor);else document.body.append(panel);
 }
 function report(scope,kind='FAILED'){
  scope=scopes.has(scope)?scope:'LOAD';kind=kinds.has(kind)?kind:'FAILED';
  const code='POS-'+scope+'-'+kind;
  // Background health checks must not replace a specific action's diagnosis.
  if(scope==='CONNECTION'&&last&&!last.code.startsWith('POS-CONNECTION-'))return code;
  try{
   last=Object.freeze({code,time:new Date().toISOString(),version,online:navigator.onLine===true});
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
 window.bnPosDiagnostics={report,decorate,clear};
 window.addEventListener('pagehide',clear);
 window.addEventListener('storage',event=>{if(event.key===null||event.key==='bringness-pos-token')clear();});
 document.getElementById('restaurant')?.addEventListener('change',clear);
})();
