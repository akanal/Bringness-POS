(()=>{
  const cents=value=>Math.round(Number(String(value).replace(',','.'))*100);
  const euro=value=>(Number(value||0)/100).toLocaleString('de-DE',{style:'currency',currency:'EUR'});

  async function completeSale(){
    if(!cart.length)return;
    const button=document.getElementById('pay');
    const status=document.getElementById('saleMsg');
    const method=document.getElementById('paymentMethod').value;
    const total=Math.round(cart.reduce((sum,item)=>sum+Number(item.qty)*Number(item.price),0)*100);
    const given=window.bnCashTenderValue?cents(window.bnCashTenderValue):total;
    if(method==='cash'&&(!Number.isFinite(given)||given<total)){
      status.textContent='Gegebener Betrag zu niedrig. Bitte Betrag im Zahlenfeld korrigieren oder mit C löschen.';
      return;
    }
    button.disabled=true;
    status.textContent='Zahlung wird gespeichert…';
    try{
      const result=await api('/orders/checkout',{method:'POST',body:JSON.stringify({
        restaurantId:document.getElementById('restaurant').value,
        items:cart.map(item=>({productId:item.id,qty:item.qty})),
        payments:[{method,amountCents:total}]
      })});
      cart=[];
      renderCart();
      if(window.bnResetTender)window.bnResetTender();
      status.textContent='Verkauf gespeichert: '+result.receiptNumber+'.'+(method==='cash'?' Rückgeld: '+euro(given-total)+'.':' Kartenzahlung erfasst.')+' Beleg unter „Belege“.';
    }catch(error){
      status.textContent='Zahlung nicht gespeichert: '+error.message;
    }finally{button.disabled=false}
  }

  function bind(){
    const button=document.getElementById('pay');
    const method=document.getElementById('paymentMethod');
    if(!button||!method)return;
    method.hidden=false;
    const basket=button.closest('.basket');
    if(basket)basket.hidden=false;
    button.onclick=completeSale;
  }
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',bind):bind();
})();
