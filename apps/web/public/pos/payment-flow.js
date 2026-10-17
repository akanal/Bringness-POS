(()=>{
  const cents=value=>Math.round(Number(String(value).replace(',','.'))*100);
  const euro=value=>(Number(value||0)/100).toLocaleString('de-DE',{style:'currency',currency:'EUR'});
  const storageKey=id=>'bringness.checkout.pending.v1:'+id;
  const signature=(items,restaurantId)=>JSON.stringify({restaurantId,items:items.map(item=>({productId:item.id,qty:item.qty})).sort((a,b)=>a.productId.localeCompare(b.productId))});
  let busy=false;

  async function completeSale(){
    if(busy)return;
    const button=document.getElementById('pay'),status=document.getElementById('saleMsg');
    const restaurantId=document.getElementById('restaurant').value;
    let pending;
    try{
      const raw=localStorage.getItem(storageKey(restaurantId));
      pending=raw?JSON.parse(raw):null;
      if(pending&&(!pending.body||pending.body.restaurantId!==restaurantId||typeof pending.body.requestKey!=='string'||!Array.isArray(pending.body.items)||!Array.isArray(pending.body.payments)))throw Error('Ungültige Wiederherstellungsdaten');
    }catch{
      status.textContent='Zahlungsspeicher nicht verfügbar oder ungültig. Keine neue Zahlung ausgelöst. Bitte vorhandene Belege prüfen und Speicherzugriff wiederherstellen.';return;
    }
    if(!pending&&!cart.length)return;
    const resuming=!!pending;
    if(!pending||pending.correctable&&cart.length){
      const method=document.getElementById('paymentMethod').value;
      if(method!=='cash'){
        status.textContent='Kartenzahlung erst nach serverseitig verifizierter Terminalanbindung verfügbar. Es wurde keine Zahlung ausgelöst.';return;
      }
      const total=Math.round(cart.reduce((sum,item)=>sum+Number(item.qty)*Number(item.price),0)*100);
      const given=window.bnCashTenderValue?cents(window.bnCashTenderValue):total;
      if(!Number.isSafeInteger(total)||total<=0||!Number.isFinite(given)||given<total){
        status.textContent='Gegebener Betrag zu niedrig oder Warenkorb ungültig. Bitte Betrag und Artikel prüfen.';return;
      }
      if(!pending&&!crypto.randomUUID){status.textContent='Sichere Zahlungskennung nicht verfügbar. Bitte Kasse über HTTPS öffnen.';return;}
      pending={body:{requestKey:pending?.body.requestKey||crypto.randomUUID(),restaurantId,items:cart.map(item=>({productId:item.id,qty:item.qty})),payments:[{method,amountCents:total}]},given,cartSignature:signature(cart,restaurantId)};
    }
    // Persist the immutable key and payload before sending. No token or secret is stored here.
    try{localStorage.setItem(storageKey(restaurantId),JSON.stringify(pending));}
    catch{status.textContent='Zahlung kann nicht sicher gespeichert werden. Keine neue Zahlung ausgelöst.';return;}
    busy=true;button.disabled=true;
    status.textContent=resuming?'Vorherige Zahlung wird mit derselben Kennung abgeglichen…':'Zahlung wird gespeichert…';
    try{
      const result=await api('/orders/checkout',{method:'POST',body:JSON.stringify(pending.body)});
      if(!result||typeof result.id!=='string'||typeof result.receiptNumber!=='string'||!result.receiptNumber.trim()||result.status!=='paid'||result.restaurantId!==restaurantId||result.requestKey!==pending.body.requestKey||!Number.isSafeInteger(result.totalCents)||result.totalCents!==pending.body.payments.reduce((sum,p)=>sum+p.amountCents,0))throw Error('Unvollständige Zahlungsbestätigung');
      // Preserve any new basket edits made while the earlier request was uncertain.
      if(document.getElementById('restaurant').value===restaurantId&&signature(cart,restaurantId)===pending.cartSignature){cart=[];renderCart();if(window.bnResetTender)window.bnResetTender();}
      try{localStorage.removeItem(storageKey(restaurantId));}catch{}
      const total=pending.body.payments.reduce((sum,p)=>sum+p.amountCents,0);
      status.textContent='Verkauf gespeichert: '+result.receiptNumber+'. Rückgeld: '+euro(pending.given-total)+'. Beleg unter „Belege“.';
    }catch(error){
      // Validation fixes may change the payload, but must never replace the request key.
      if(error.status===400){pending.correctable=true;try{localStorage.setItem(storageKey(restaurantId),JSON.stringify(pending));}catch{}}
      status.textContent='Zahlungsstatus ungeklärt oder abgelehnt: '+error.message+' Erneut mit derselben Kennung abgleichen; Bargeld nicht nochmals kassieren.';
    }finally{busy=false;button.disabled=false;}
  }

  function bind(){
    const button=document.getElementById('pay'),method=document.getElementById('paymentMethod');
    if(!button||!method)return;
    method.hidden=false;
    const basket=button.closest('.basket');if(basket)basket.hidden=false;
    button.onclick=completeSale;
  }
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',bind):bind();
})();
