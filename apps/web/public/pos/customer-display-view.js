(()=>{
 // Keep the restricted display capability in the fragment and the opener reference:
 // removing both made a customer-window reload permanently lose the live basket.
 const source=window.opener,origin=location.origin,channel=location.hash.slice(1);
 const $=id=>document.getElementById(id);let seen=0,lastSequence=0;
 const clear=(text,preserveArtwork=false)=>{const art=$('display-artwork');if(art&&!preserveArtwork){art.hidden=true;art.removeAttribute('src');}$('display-order').hidden=true;$('display-lines').replaceChildren();$('display-adjustments').replaceChildren();$('display-total').textContent='';$('display-business').textContent='';$('display-status').textContent=text;const welcome=$('display-welcome');if(welcome)welcome.hidden=false;const receipt=$('display-receipt');if(receipt)receipt.hidden=true;const qr=$('display-receipt-qr');if(qr){qr.removeAttribute('src');qr.hidden=true;}};
 const money=n=>(n/100).toLocaleString('de-DE',{style:'currency',currency:'EUR'}),amount=n=>Number.isSafeInteger(n)&&Math.abs(n)<=1000000000000;
 if(!source||!/^[a-f0-9]{64}$/.test(channel)){clear('Bitte das Kundendisplay aus der Kasse öffnen.');return;}
 window.addEventListener('message',event=>{
  const m=event.data;if(event.origin!==origin||event.source!==source||!m||m.type!=='bringness:customer-display'||m.channel!==channel||!Number.isSafeInteger(m.sequence)||m.sequence<=lastSequence)return;
  lastSequence=m.sequence;const s=m.snapshot;if(!s||typeof s.business!=='string'||s.business.length>120||!Array.isArray(s.items)||s.items.length>100||!Array.isArray(s.adjustments)||s.adjustments.length>120||!amount(s.totalCents)||s.items.some(x=>typeof x.name!=='string'||x.name.length>500||!Number.isSafeInteger(x.qty)||x.qty<1||x.qty>999999||!amount(x.totalCents))||s.adjustments.some(x=>typeof x.name!=='string'||x.name.length>500||!amount(x.totalCents))){clear('Anzeige wird aktualisiert …');return;}
  const hasArtwork=s.state==='idle'&&typeof s.artwork==='string'&&s.artwork.length<=2200000&&/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(s.artwork);
  seen=Date.now();clear('',hasArtwork);$('display-business').textContent=s.business;
  if(s.state==='paid'&&typeof s.receiptNumber==='string'&&s.receiptNumber.length<=80){
   if($('display-welcome'))$('display-welcome').hidden=true;
   if($('display-receipt'))$('display-receipt').hidden=false;
   if($('display-receipt-number'))$('display-receipt-number').textContent='Quittung '+s.receiptNumber;
   const qr=$('display-receipt-qr'),valid=typeof s.qrDataUrl==='string'&&s.qrDataUrl.length<=100000&&/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(s.qrDataUrl);
   if(qr&&valid){qr.src=s.qrDataUrl;qr.hidden=false;}
   if($('display-receipt-help'))$('display-receipt-help').textContent=valid?'Sie können Ihre Quittung hier herunterladen. Scannen Sie den QR-Code mit Ihrem Handy.':'Ihre Quittung erhalten Sie an der Kasse.';
   return;
  }
  if(hasArtwork&&$('display-artwork')){const art=$('display-artwork');if(art.getAttribute('src')!==s.artwork)art.src=s.artwork;art.hidden=false;if($('display-welcome'))$('display-welcome').hidden=true;}
  if(s.state!=='cart'){if(s.state==='unavailable')$('display-status').textContent='Betrag wird an der Kasse geprüft.';return;}
  if($('display-welcome'))$('display-welcome').hidden=true;
  const row=(name,value)=>{const div=document.createElement('div'),label=document.createElement('span'),total=document.createElement('strong');div.className='customer-line';label.textContent=name;total.textContent=money(value);div.append(label,total);return div;};
  $('display-lines').replaceChildren(...s.items.map(x=>row(x.qty+' × '+x.name,x.totalCents)));$('display-adjustments').replaceChildren(...s.adjustments.map(x=>row(x.name,x.totalCents)));$('display-total').textContent=money(s.totalCents);$('display-order').hidden=false;
 });
 const ready=()=>source.postMessage({type:'bringness:customer-display-ready',channel},origin);ready();
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)ready()});window.addEventListener('focus',ready);
 setInterval(()=>{if(!seen||Date.now()-seen>7000){clear('Verbindung zur Kasse unterbrochen · bitte warten.');ready();}},2000);
})();
