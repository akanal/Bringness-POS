(()=>{
 const labels={scanner:'Scanner',printer:'Bondrucker'},outcomes={unverified:'Ungeprüft',user_confirmed:'Vom Benutzer bestätigt',problem:'Problem festgestellt'};
 const canonical=value=>JSON.stringify(value, Object.keys(value).sort());
 window.createPosDeviceChecks=({request,withTask,context,notify,makeCsv,resetPrint,resetScan})=>{
  const $=id=>document.getElementById(id),el=(tag,text)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node};
  let bound=null,records=[],asOf=null,cursor=null,version=0,pendingCheck=null;
  const attempts={scanner:0,printer:0},baseline={},evidence={observedCode:'',printRequested:false};
  const form=kind=>{
   const label=$('device-'+kind+'-label').value.trim(),outcome=$('device-'+kind+'-outcome').value,note=$('device-'+kind+'-note').value.trim();
   const details=kind==='scanner'?{expectedCode:$('device-scanner-expected').value.trim(),observedCode:evidence.observedCode}:{paperWidth:$('device-printer-width').value,printRequested:evidence.printRequested,paperSeen:$('paper-confirm').checked,legible:$('device-printer-legible').checked,glyphs:$('device-printer-glyphs').checked,output:$('device-printer-output').checked};
   return {kind,label,outcome,details,note};
  };
  const snapshot=kind=>JSON.stringify([form(kind),attempts[kind]]);
  const dirty=()=>!!bound&&['scanner','printer'].some(kind=>baseline[kind]!==snapshot(kind));
  const status=text=>$('device-status').textContent=text;
  const state=()=>({dirty:dirty(),pending:!!pendingCheck,busy:!!context().active});
  function invalidate(){version++;records=[];asOf=null;cursor=null;$('device-check-list').replaceChildren();lock();}
  function resetForms(){
   evidence.observedCode='';evidence.printRequested=false;
   for(const kind of ['scanner','printer']){$('device-'+kind+'-label').value='';$('device-'+kind+'-outcome').value='unverified';$('device-'+kind+'-note').value='';attempts[kind]=0;}
   $('device-scanner-expected').value='';$('device-printer-width').value='unknown';for(const id of ['paper-confirm','device-printer-legible','device-printer-glyphs','device-printer-output'])$(id).checked=false;
   resetPrint();resetScan();for(const kind of ['scanner','printer'])baseline[kind]=snapshot(kind);
  }
  function reset(){bound=null;pendingCheck=null;invalidate();resetForms();$('device-filter').value='';status('Prüfprotokolle für den gewählten Betrieb laden.');notify();}
  function lock(){
   const ctx=context(),waiting=ctx.busy||!!pendingCheck;
   for(const node of document.querySelectorAll('.device-fields input,.device-fields textarea,.device-fields select'))node.disabled=waiting||!bound;
   for(const kind of ['scanner','printer'])$('device-'+kind+'-save').disabled=waiting||!bound||baseline[kind]===snapshot(kind);
   for(const id of ['scan','print','paper-confirm'])$(id).disabled=waiting;
   $('device-load').disabled=waiting||!ctx.restaurantId;$('device-filter').disabled=waiting||!bound;$('device-more').hidden=!cursor;$('device-more').disabled=waiting;$('device-retry').hidden=!pendingCheck;$('device-retry').disabled=ctx.busy;$('device-discard').disabled=waiting||!dirty();
   for(const button of document.querySelectorAll('#device-check-list button'))button.disabled=waiting;
  }
  function validRecord(row,scope){
   if(!row||row.company_id!==scope.companyId||row.restaurant_id!==scope.restaurantId||typeof row.request_id!=='string'||typeof row.event_number!=='string'||!/^[1-9][0-9]{0,18}$/.test(row.event_number)||!labels[row.kind]||!outcomes[row.outcome]||typeof row.label!=='string'||typeof row.note!=='string'||typeof row.actor_id!=='string'||typeof row.actor_label!=='string'||!Number.isFinite(Date.parse(row.created_at))||row.evidence_source!=='user_report'||row.protocol_version!==1||!row.details||typeof row.details!=='object'||Array.isArray(row.details))throw Error('Prüfprotokoll nicht eindeutig bestätigt.');
   const details=row.details;if(row.kind==='scanner'){if(Object.keys(details).sort().join()!=='expectedCode,observedCode'||typeof details.expectedCode!=='string'||typeof details.observedCode!=='string')throw Error('Scannerprotokoll nicht eindeutig bestätigt.');}
   else if(Object.keys(details).sort().join()!=='glyphs,legible,output,paperSeen,paperWidth,printRequested'||!['58','80','other','unknown'].includes(details.paperWidth)||['printRequested','paperSeen','legible','glyphs','output'].some(key=>typeof details[key]!=='boolean'))throw Error('Druckerprotokoll nicht eindeutig bestätigt.');return row;
  }
  function current(epoch,wanted,filter){return epoch===context().epoch&&wanted===context().restaurantId&&(filter===undefined||filter===$('device-filter').value);}
  async function getPage({scope,stand=null,before=null,id=null,filter=$('device-filter').value}){
   const params=new URLSearchParams({restaurantId:scope.restaurantId});if(scope.companyId)params.set('companyId',scope.companyId);if(stand!==null)params.set('asOf',stand);if(before!==null)params.set('cursor',before);if(id)params.set('requestId',id);if(filter)params.set('kind',filter);
   const data=await request('/pos-device-checks?'+params);if(data?.restaurantId!==scope.restaurantId||typeof data.companyId!=='string'||!data.companyId||typeof data.asOf!=='string'||!/^[0-9]{1,19}$/.test(data.asOf)||stand!==null&&data.asOf!==stand||!Array.isArray(data.rows)||data.rows.length>50)throw Error('Prüfprotokolle nicht eindeutig bestätigt.');
   if(scope.companyId&&scope.companyId!==data.companyId)throw Object.assign(Error('Betriebskontext geändert. Prüfprotokolle bitte neu laden.'),{code:'DEVICE_SCOPE_CHANGED'});
   const actual={restaurantId:data.restaurantId,companyId:data.companyId};let prior=before===null?BigInt(data.asOf)+1n:BigInt(before);const seen=new Set();
   for(const row of data.rows){validRecord(row,actual);if(BigInt(row.event_number)>=prior||seen.has(row.request_id)||id&&row.request_id!==id)throw Error('Prüfprotokollseite ist mehrdeutig.');prior=BigInt(row.event_number);seen.add(row.request_id);}
   if(data.nextCursor!==null&&(!data.rows.length||data.nextCursor!==data.rows.at(-1).event_number))throw Error('Ungültige Protokollfortsetzung.');return data;
  }
  async function load(epoch,more=false){
   const wanted=context().restaurantId;if(!wanted)throw Error('Bitte zuerst Zählstände laden.');const filter=$('device-filter').value,mark=version,scope=bound||{restaurantId:wanted},stand=more?asOf:null,before=more?cursor:null;
   const data=await getPage({scope,stand,before,filter});if(!current(epoch,wanted,filter)||mark!==version)return;
   if(!bound){bound={restaurantId:wanted,companyId:data.companyId};resetForms();}
   if(more&&data.rows.some(row=>records.some(old=>old.request_id===row.request_id||old.event_number===row.event_number)))throw Error('Prüfprotokollseite wurde doppelt geliefert.');
   records=more?[...records,...data.rows]:data.rows;asOf=data.asOf;cursor=data.nextCursor;render();status(records.length?records.length+' gespeicherte Benutzerprotokolle.'+(cursor?' Weitere Einträge verfügbar.':''):'Noch keine gespeicherten Benutzerprotokolle für diese Auswahl.');notify();
  }
  const run=work=>withTask(async epoch=>{try{await work(epoch)}catch(error){if(epoch!==context().epoch)return;if([401,403,404].includes(error.status)||error.code==='DEVICE_SCOPE_CHANGED')reset();status(error.message||'Prüfprotokoll konnte nicht geladen werden.');notify();}});
  async function save(epoch){
   const attempt=pendingCheck,command=attempt.command,wanted=command.restaurantId;
   let acknowledged=false;
   try{
    const ack=await request('/pos-device-checks',command);if(!current(epoch,wanted)||pendingCheck!==attempt)return;
    const scope={restaurantId:command.restaurantId,companyId:command.companyId};const row=validRecord(ack.check,scope);
    if(ack.requestId!==command.requestId||ack.restaurantId!==wanted||ack.companyId!==command.companyId||row.request_id!==command.requestId||row.kind!==command.kind||row.label!==command.label||row.outcome!==command.outcome||row.note!==command.note||canonical(row.details)!==canonical(command.details))throw Error('Speicherung nicht bestätigt. Dieselbe Vorgangskennung erneut prüfen.');
    acknowledged=true;baseline[command.kind]=attempt.snapshot;pendingCheck=null;records=[row];asOf=null;cursor=null;render();status('Prüfprotokoll gespeichert – Benutzerangabe, kein automatischer Gerätenachweis.');notify();
    try{await load(epoch);if(current(epoch,wanted))status('Prüfprotokoll gespeichert – Benutzerangabe, kein automatischer Gerätenachweis.');}catch(error){if(!current(epoch,wanted))return;if([401,403,404].includes(error.status)||error.code==='DEVICE_SCOPE_CHANGED'){reset();throw error;}status('Prüfprotokoll gespeichert. Verlauf konnte noch nicht geladen werden; bitte erneut laden.');}
   }catch(error){
    if(!current(epoch,wanted))return;
    if(!acknowledged&&error.definitive){pendingCheck=null;if([401,403,404].includes(error.status)||error.code==='DEVICE_SCOPE_CHANGED')reset();}
    throw error;
   }
  }
  function validateForm(value){
   if(!value.label||value.label.length>100||value.note.length>500)throw Error('Gerätebezeichnung und Anmerkung prüfen.');
   if(value.outcome==='problem'&&!value.note)throw Error('Bitte das festgestellte Problem beschreiben.');
   if(value.kind==='scanner'&&value.outcome==='user_confirmed'&&(!value.details.expectedCode||value.details.expectedCode!==value.details.observedCode))throw Error('Erst den passenden Sollcode empfangen und das Ergebnis bestätigen.');
   if(value.kind==='printer'&&value.outcome==='user_confirmed'&&(value.details.paperWidth==='unknown'||['printRequested','paperSeen','legible','glyphs','output'].some(key=>!value.details[key])))throw Error('Erst Testdruck anfordern, Papier prüfen und alle Prüfpunkte bestätigen.');
  }
  function render(){
   $('device-check-list').replaceChildren();for(const row of records){const item=el('details'),title=el('summary',labels[row.kind]+' · '+row.label+' · '+outcomes[row.outcome]);item.append(title,el('p','Gespeichert: '+new Date(row.created_at).toLocaleString('de-DE',{hourCycle:'h23'})+' · '+row.actor_label),el('p','Benutzerangabe – kein automatischer Gerätenachweis.'));
    if(row.kind==='scanner')item.append(el('p','Sollcode: '+(row.details.expectedCode||'Nicht angegeben')),el('p','Empfangen: '+(row.details.observedCode||'Kein Code angegeben')));
    else{item.append(el('p','Papierbreite: '+widthLabel(row.details.paperWidth)));for(const [key,label]of [['printRequested','Testdruck angefordert'],['paperSeen','Papier gesehen'],['legible','Text lesbar'],['glyphs','Sonderzeichen korrekt'],['output','Papierausgabe / Schnitt oder Abriss in Ordnung']])item.append(el('p',label+': '+(row.details[key]?'Vom Benutzer angegeben':'Nicht bestätigt')));}
    if(row.note)item.append(el('p',row.note));item.append(el('p','Interne Kontokennung: '+row.actor_id));const button=el('button','Dieses Prüfprotokoll als CSV');button.type='button';button.onclick=()=>{if(context().busy||pendingCheck)return;run(epoch=>exportOne(epoch,row));};item.append(button);$('device-check-list').append(item);
   }lock();
  }
  function widthLabel(value){return value==='58'||value==='80'?value+' mm':value==='other'?'Andere Breite':'Nicht angegeben';}
  async function exportOne(epoch,selected){
   const scope={restaurantId:selected.restaurant_id,companyId:selected.company_id},mark=version;
   const data=await getPage({scope,id:selected.request_id,filter:''});if(!current(epoch,scope.restaurantId)||mark!==version)return;if(data.rows.length!==1||data.rows[0].event_number!==selected.event_number)throw Error('Prüfprotokoll nicht eindeutig bestätigt.');const row=data.rows[0];
   const fields=[['Bringness POS – Geräte-Prüfprotokoll','Benutzerangabe, kein automatischer Gerätenachweis'],['Betriebskennung',row.restaurant_id],['Prüfart',labels[row.kind]],['Gerät / Arbeitsplatz',row.label],['Ergebnis',outcomes[row.outcome]],['Gespeichert am',row.created_at],['Internes Konto',row.actor_label],['Kontokennung',row.actor_id],['Vorgangskennung',row.request_id]];
   if(row.kind==='scanner')fields.push(['Sollcode',row.details.expectedCode],['Empfangener Code',row.details.observedCode]);else{fields.push(['Papierbreite',widthLabel(row.details.paperWidth)]);for(const key of ['printRequested','paperSeen','legible','glyphs','output'])fields.push([{printRequested:'Testdruck angefordert',paperSeen:'Papier gesehen',legible:'Text lesbar',glyphs:'Sonderzeichen korrekt',output:'Papierausgabe / Schnitt oder Abriss'}[key],row.details[key]?'Vom Benutzer angegeben':'Nicht bestätigt']);}fields.push(['Anmerkung',row.note]);
   const url=URL.createObjectURL(new Blob([makeCsv(fields)],{type:'text/csv;charset=utf-8'})),link=el('a');link.href=url;link.download='Bringness-POS-Geraetepruefung.csv';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);status('Gespeichertes Benutzerprotokoll als CSV exportiert. Keine Geräte- oder TSE-Zertifizierung.');
  }
  for(const kind of ['scanner','printer']){
   $('device-'+kind+'-save').onclick=()=>{if(context().busy||pendingCheck||!bound||baseline[kind]===snapshot(kind))return;try{const value=form(kind);validateForm(value);pendingCheck={command:{requestId:crypto.randomUUID(),restaurantId:bound.restaurantId,companyId:bound.companyId,...value},snapshot:snapshot(kind)};notify();run(save);}catch(error){status(error.message);}};
   for(const node of document.querySelectorAll('[data-device='+kind+'] input,[data-device='+kind+'] select,[data-device='+kind+'] textarea'))node.addEventListener('input',()=>{
    if(pendingCheck)return;if(node.id==='device-'+kind+'-label'||node.id==='device-scanner-expected'||node.id==='device-printer-width'){
     if(kind==='scanner'){evidence.observedCode='';resetScan();}else{evidence.printRequested=false;for(const id of ['paper-confirm','device-printer-legible','device-printer-glyphs','device-printer-output'])$(id).checked=false;resetPrint();}
     if($('device-'+kind+'-outcome').value==='user_confirmed')$('device-'+kind+'-outcome').value='unverified';
    }notify();
   });
  }
  $('paper-confirm').addEventListener('change',()=>{if(!pendingCheck)notify();});$('device-load').onclick=()=>run(epoch=>load(epoch));$('device-more').onclick=()=>cursor&&run(epoch=>load(epoch,true));$('device-retry').onclick=()=>pendingCheck&&run(save);
  $('device-filter').onchange=()=>{invalidate();status('Prüfart geändert. Protokolle bitte neu laden.');notify();};$('device-discard').onclick=()=>{if(context().busy||pendingCheck||!dirty()||!confirm('Offene Geräteangaben verwerfen? Gespeicherte Prüfprotokolle bleiben erhalten.'))return;resetForms();status('Offene Geräteangaben verworfen. Gespeicherte Protokolle bleiben erhalten.');notify();};
  resetForms();lock();
  return {state,lock,reset,canTest:()=>!context().busy&&!pendingCheck,width:()=>$('device-printer-width').value,scanned:value=>{if(!bound||pendingCheck)return;evidence.observedCode=value;attempts.scanner++;if($('device-scanner-outcome').value==='user_confirmed')$('device-scanner-outcome').value='unverified';status(value&&value===$('device-scanner-expected').value.trim()?'Sollcode und empfangener Code stimmen überein. Ergebnis bitte selbst bestätigen.':'Sollcode und empfangenen Code prüfen.');notify();},printed:()=>{if(!bound||pendingCheck)return;evidence.printRequested=true;attempts.printer++;for(const id of ['device-printer-legible','device-printer-glyphs','device-printer-output'])$(id).checked=false;$('device-printer-outcome').value='unverified';notify();}};
 };
})();
