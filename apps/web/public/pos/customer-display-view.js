(()=>{
 const source=window.opener,origin=location.origin,channel=location.hash.slice(1);history.replaceState(null,'',location.pathname);try{window.opener=null}catch{}
 const $=id=>document.getElementById(id);let seen=0,lastSequence=0;
 const clear=text=>{$('display-order').hidden=true;$('display-lines').replaceChildren();$('display-adjustments').replaceChildren();$('display-total').textContent='';$('display-business').textContent='Willkommen';$('display-status').textContent=text;};
 const money=n=>(n/100).toLocaleString('de-DE',{style:'currency',currency:'EUR'}),amount=n=>Number.isSafeInteger(n)&&Math.abs(n)<=1000000000000;
 if(!source||!/^[a-f0-9]{64}$/.test(channel)){clear('Bitte das Kundendisplay aus der Kasse öffnen.');return;}
 window.addEventListener('message',event=>{
  const m=event.data;if(event.origin!==origin||event.source!==source||!m||m.type!=='bringness:customer-display'||m.channel!==channel||!Number.isSafeInteger(m.sequence)||m.sequence<=lastSequence)return;
  lastSequence=m.sequence;const s=m.snapshot;if(!s||typeof s.business!=='string'||s.business.length>120||!Array.isArray(s.items)||s.items.length>100||!Array.isArray(s.adjustments)||s.adjustments.length>120||!amount(s.totalCents)||s.items.some(x=>typeof x.name!=='string'||x.name.length>500||!Number.isSafeInteger(x.qty)||x.qty<1||x.qty>999999||!amount(x.totalCents))||s.adjustments.some(x=>typeof x.name!=='string'||x.name.length>500||!amount(x.totalCents))){clear('Anzeige wird aktualisiert …');return;}
  seen=Date.now();if(s.state!=='cart'){clear(s.state==='unavailable'?'Betrag wird an der Kasse geprüft.':'Willkommen · dein Einkauf erscheint hier.');return;}
  $('display-business').textContent=s.business;$('display-status').textContent='Aktueller Einkauf';const row=(name,value)=>{const div=document.createElement('div'),label=document.createElement('span'),total=document.createElement('strong');div.className='customer-line';label.textContent=name;total.textContent=money(value);div.append(label,total);return div;};
  $('display-lines').replaceChildren(...s.items.map(x=>row(x.qty+' × '+x.name,x.totalCents)));$('display-adjustments').replaceChildren(...s.adjustments.map(x=>row(x.name,x.totalCents)));$('display-total').textContent=money(s.totalCents);$('display-order').hidden=false;
 });
 source.postMessage({type:'bringness:customer-display-ready',channel},origin);
 setInterval(()=>{if(!seen||Date.now()-seen>7000)clear('Verbindung zur Kasse unterbrochen · bitte warten.');},2000);
})();
