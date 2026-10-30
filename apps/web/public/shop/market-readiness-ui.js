const labels={MERCHANT_IDENTITY_BOUND:'Händlerkonto und Zahlungsprofil im Testmodus zugeordnet',MARKETPLACE_HOST_ENABLED:'Marktplatz im vorgesehenen Anwendungsmodus',TEST_CHECKOUT_OPT_IN:'Testcheckout ausdrücklich aktiviert',HTTPS_ORIGIN:'Öffentliche HTTPS-Adresse',OAUTH_CLIENT_ID:'Mollie-Anwendungskennung',OAUTH_CLIENT_SECRET:'Geschütztes Mollie-Anwendungsgeheimnis',TOKEN_ENCRYPTION_KEY:'Dauerhafter Tokenschlüssel',HTTP_TRANSPORT:'Anbietertransport',CALLBACK_MATCH:'OAuth-Rückkehradresse',RETURN_MATCH:'Kunden-Rückkehradresse',WEBHOOK_MATCH:'Zahlungsbenachrichtigung',TEST_ADAPTER_CONFIGURED:'Testadapter verbunden',MIGRATIONS_READY:'Datenbank vorbereitet',MERCHANT_PROFILE_VERIFIED:'Händlerprofil für Tests geprüft',BACKGROUND_RECONCILIATION:'Hintergrundprüfung aktiviert',REAL_MERCHANT_ACCEPTANCE:'Echte Händlerabnahme',PRODUCTION_ACCOUNTING_ACCEPTANCE:'Produktive Abrechnung abgenommen',PRODUCTION_FULFILMENT_ACCEPTANCE:'Produktive Bestellübergabe abgenommen',HOST_NOT_CONFIGURED:'Testhost eingerichtet'};
export function readinessLines(report){
 if(!report||report.paymentMode!=='test'||report.canPay!==false||report.canFulfil!==false||report.productionReady!==false||!Array.isArray(report.checks)||report.checks.length>30||!Array.isArray(report.blockers))throw Error('INVALID_RESPONSE');
 const seen=new Set();const lines=report.checks.map(c=>{if(!c||!Object.hasOwn(labels,c.code)||typeof c.ok!=='boolean'||seen.has(c.code))throw Error('INVALID_RESPONSE');seen.add(c.code);return (c.ok?'Geprüft: ':'Offen: ')+labels[c.code];});
 const expected=report.checks.filter(c=>!c.ok).map(c=>c.code);
 if(report.checks.length!==Object.keys(labels).length-1||Object.keys(labels).filter(k=>k!=='HOST_NOT_CONFIGURED').some(k=>!seen.has(k))||report.blockers.length!==expected.length||report.blockers.some((code,i)=>code!==expected[i])||report.checks.some(c=>['REAL_MERCHANT_ACCEPTANCE','PRODUCTION_ACCOUNTING_ACCEPTANCE','PRODUCTION_FULFILMENT_ACCEPTANCE'].includes(c.code)&&c.ok))throw Error('INVALID_RESPONSE');
 return lines;
}
export function mountMarketReadiness({window:w,host,client}){
 const d=host.ownerDocument,button=d.createElement('button'),status=d.createElement('p'),list=d.createElement('ul');button.type='button';button.textContent='Zahlungsfreigabe prüfen';status.setAttribute('role','status');status.textContent='Freigabestatus noch nicht geladen.';host.append(button,status,list);
 let epoch=0,busy=false;const token=()=>w.localStorage.getItem('bringness-pos-token');
 function privacy(){epoch++;list.replaceChildren();status.textContent='Private Freigabeansicht geschlossen. Bitte erneut laden.';}
 w.addEventListener('pagehide',privacy);w.addEventListener('storage',e=>{if(e.key===null||e.key==='bringness-pos-token')privacy();});d.addEventListener('visibilitychange',()=>{if(d.hidden)privacy();});
 button.addEventListener('click',async()=>{if(busy||d.hidden)return;busy=true;button.disabled=true;const e=++epoch,t=token();list.replaceChildren();status.textContent='Freigabestatus wird geprüft.';
  try{const r=await client.call('/merchant-readiness',{auth:true});if(e!==epoch||token()!==t||d.hidden)return;const lines=readinessLines(r);for(const text of lines){const item=d.createElement('li');item.textContent=text;list.append(item);}status.textContent='Testmodus. Echte Zahlungen und Warenfreigabe bleiben gesperrt. Lokale Konfigurationsprüfungen ersetzen keine Händlerabnahme.';}
  catch{if(e===epoch&&token()===t&&!d.hidden){list.replaceChildren();status.textContent='Freigabestatus konnte nicht geladen werden. Bitte erneut versuchen.';}}
  finally{busy=false;button.disabled=false;}
 });return {privacy};
}
