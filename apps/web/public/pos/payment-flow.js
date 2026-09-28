(()=>{
  const style=document.createElement('style');
  style.textContent=`
    .bn-pay-overlay{position:fixed;inset:0;background:#0b1d2f88;z-index:10000;display:grid;place-items:center;padding:18px}
    .bn-pay-box{width:min(520px,100%);background:#fff;border-radius:18px;padding:20px;box-shadow:0 24px 70px #0004}
    .bn-pay-head{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:14px}
    .bn-pay-head h2{margin:0;font-size:24px}.bn-pay-total{font-size:22px;font-weight:900}
    .bn-pay-tabs{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:12px 0}
    .bn-pay-tabs button{padding:11px;border:1px solid #d9e2eb;border-radius:10px;background:#fff;font-weight:800;cursor:pointer}
    .bn-pay-tabs button.active{background:#102235;color:#fff;border-color:#102235}
    .bn-pay-panel{display:none;border-top:1px solid #e6ebef;padding-top:14px}.bn-pay-panel.show{display:block}
    .bn-pay-row{display:grid;gap:6px;margin:10px 0}.bn-pay-row input{padding:12px;border:1px solid #d6e0e8;border-radius:9px;font:inherit}
    .bn-pay-summary{display:grid;grid-template-columns:1fr auto;gap:8px;padding:12px 0;font-weight:800}
    .bn-pay-summary strong{font-size:20px}.bn-pay-actions{display:flex;gap:9px;justify-content:flex-end;margin-top:16px}
    .bn-pay-actions button{padding:11px 15px;border-radius:9px;border:1px solid #d7dfe6;background:#fff;font-weight:800;cursor:pointer}
    .bn-pay-actions .primary{background:#ff7628;color:#fff;border-color:#ff7628}.bn-pay-actions .primary:disabled{opacity:.45;cursor:not-allowed}
    .bn-quick{display:flex;gap:7px;flex-wrap:wrap}.bn-quick button{padding:8px 10px;border:1px solid #d7dfe6;background:#f8fafc;border-radius:8px;cursor:pointer}
    .bn-pay-note{font-size:12px;color:#617286;margin-top:6px}
  `;
  document.head.appendChild(style);

  const cents=n=>Math.round(Number(String(n).replace(',','.'))*100);
  const fmt=c=>(Number(c||0)/100).toLocaleString('de-DE',{style:'currency',currency:'EUR'});
  const totalCents=()=>Math.round(cart.reduce((sum,item)=>sum+Number(item.qty)*Number(item.price),0)*100);

  function close(overlay){ overlay.remove(); }

  async function submitPayment(overlay,payments,extraMessage=''){
    const confirmBtn=overlay.querySelector('[data-confirm]');
    confirmBtn.disabled=true;
    try{
      const result=await api('/orders/checkout',{method:'POST',body:JSON.stringify({
        restaurantId:$("restaurant").value,
        items:cart.map(item=>({productId:item.id,qty:item.qty})),
        payments
      })});
      cart=[];
      renderCart();
      close(overlay);
      $("saleMsg").textContent='Verkauf gespeichert: '+result.receiptNumber+'. '+extraMessage+' Unter Belege kannst du den PDF-Beleg herunterladen. Ohne TSE-Signatur.';
    }catch(error){
      const msg=overlay.querySelector('[data-error]');
      msg.textContent='Fehler: '+error.message;
      confirmBtn.disabled=false;
    }
  }

  function openDialog(){
    if(!cart.length)return;
    const total=totalCents();
    const overlay=document.createElement('div');
    overlay.className='bn-pay-overlay';
    overlay.innerHTML=`
      <div class="bn-pay-box" role="dialog" aria-modal="true" aria-label="Zahlung">
        <div class="bn-pay-head"><h2>Zahlung</h2><div class="bn-pay-total">${fmt(total)}</div></div>
        <div class="bn-pay-tabs">
          <button type="button" data-mode="cash" class="active">Bar</button>
          <button type="button" data-mode="card">Karte</button>
          <button type="button" data-mode="split">Teilzahlung</button>
        </div>
        <div class="bn-pay-panel show" data-panel="cash">
          <div class="bn-pay-row"><label>Gegeben</label><input data-cash-received inputmode="decimal" autocomplete="off" placeholder="0,00"></div>
          <div class="bn-quick">
            <button type="button" data-exact>Passend</button>
            <button type="button" data-quick="5">5 €</button><button type="button" data-quick="10">10 €</button><button type="button" data-quick="20">20 €</button><button type="button" data-quick="50">50 €</button><button type="button" data-quick="100">100 €</button>
          </div>
          <div class="bn-pay-summary"><span>Rückgeld</span><strong data-change>0,00 €</strong></div>
        </div>
        <div class="bn-pay-panel" data-panel="card">
          <p><b>${fmt(total)}</b> vollständig per Karte abrechnen.</p>
          <p class="bn-pay-note">Die Kartenzahlung wird in Bringness POS als Zahlungsart dokumentiert. Die eigentliche Terminalfreigabe bleibt beim angeschlossenen Kartenanbieter.</p>
        </div>
        <div class="bn-pay-panel" data-panel="split">
          <div class="bn-pay-row"><label>Bar-Anteil</label><input data-split-cash inputmode="decimal" autocomplete="off" placeholder="0,00"></div>
          <div class="bn-pay-summary"><span>Karten-Anteil</span><strong data-split-card>${fmt(total)}</strong></div>
          <p class="bn-pay-note">Bei Teilzahlung muss der Bar-Anteil größer als 0 € und kleiner als der Gesamtbetrag sein. Der Rest wird automatisch als Kartenzahlung verbucht.</p>
        </div>
        <div class="bn-pay-note" data-error style="color:#b42318"></div>
        <div class="bn-pay-actions"><button type="button" data-cancel>Abbrechen</button><button type="button" class="primary" data-confirm>Zahlung abschließen</button></div>
      </div>`;
    document.body.appendChild(overlay);

    let mode='cash';
    const confirmBtn=overlay.querySelector('[data-confirm]');
    const cashInput=overlay.querySelector('[data-cash-received]');
    const changeOut=overlay.querySelector('[data-change]');
    const splitInput=overlay.querySelector('[data-split-cash]');
    const splitCard=overlay.querySelector('[data-split-card]');

    function refresh(){
      overlay.querySelectorAll('[data-mode]').forEach(b=>b.classList.toggle('active',b.dataset.mode===mode));
      overlay.querySelectorAll('[data-panel]').forEach(p=>p.classList.toggle('show',p.dataset.panel===mode));
      if(mode==='cash'){
        const received=cents(cashInput.value||0);
        changeOut.textContent=fmt(Math.max(0,received-total));
        confirmBtn.disabled=received<total;
      }else if(mode==='split'){
        const cash=cents(splitInput.value||0);
        splitCard.textContent=fmt(Math.max(0,total-cash));
        confirmBtn.disabled=!(cash>0&&cash<total);
      }else confirmBtn.disabled=false;
    }

    overlay.querySelectorAll('[data-mode]').forEach(btn=>btn.onclick=()=>{mode=btn.dataset.mode;refresh()});
    overlay.querySelector('[data-cancel]').onclick=()=>close(overlay);
    overlay.onclick=e=>{if(e.target===overlay)close(overlay)};
    cashInput.oninput=refresh;
    splitInput.oninput=refresh;
    overlay.querySelector('[data-exact]').onclick=()=>{cashInput.value=(total/100).toFixed(2).replace('.',',');refresh()};
    overlay.querySelectorAll('[data-quick]').forEach(btn=>btn.onclick=()=>{cashInput.value=btn.dataset.quick+',00';refresh()});
    confirmBtn.onclick=()=>{
      if(mode==='cash'){
        const received=cents(cashInput.value||0),change=Math.max(0,received-total);
        return submitPayment(overlay,[{method:'cash',amountCents:total}],`Gegeben: ${fmt(received)} · Rückgeld: ${fmt(change)}.`);
      }
      if(mode==='card')return submitPayment(overlay,[{method:'card',amountCents:total}],'Kartenzahlung erfasst.');
      const cash=cents(splitInput.value||0),card=total-cash;
      return submitPayment(overlay,[{method:'cash',amountCents:cash},{method:'card',amountCents:card}],`Teilzahlung: ${fmt(cash)} bar + ${fmt(card)} Karte.`);
    };
    refresh();
    setTimeout(()=>cashInput.focus(),0);
  }

  function bind(){
    const payBtn=document.getElementById('pay');
    if(!payBtn)return;
    payBtn.onclick=openDialog;
    const method=document.getElementById('paymentMethod');
    if(method) method.hidden=true;
    const basket=payBtn.closest('.basket');
    if(basket) basket.hidden=false;
  }

  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',bind):bind();
  new MutationObserver(bind).observe(document.documentElement,{childList:true,subtree:true});
})();
