(()=>{
  const style=document.createElement('style');
  style.textContent=`
    .bn-cart-tools{border-top:1px solid #dce5ee;margin-top:10px;padding-top:10px}
    .bn-cart-actions{display:flex;gap:7px;flex-wrap:wrap;margin-bottom:8px}
    .bn-cart-actions button,.bn-keypad-toggle{min-height:38px;border:1px solid #cfd9e3;border-radius:10px;background:#fff;font-weight:800;padding:7px 10px;cursor:pointer}
    .bn-keypad-panel{display:none;margin-top:8px}
    .bn-keypad-panel.open{display:block}
    .bn-keypad{display:grid;grid-template-columns:repeat(3,minmax(52px,1fr));gap:7px;margin-top:8px;max-width:260px}
    .bn-keypad button{min-height:46px;border:1px solid #cfd9e3;border-radius:10px;background:#f8fafc;font-size:18px;font-weight:900;cursor:pointer}
    .bn-keypad button.bn-ok{background:#102235;color:#fff}
    .bn-keypad-display{display:flex;align-items:center;justify-content:space-between;gap:8px;max-width:260px}
    .bn-keypad-value{font-variant-numeric:tabular-nums;font-size:20px;font-weight:900;min-width:90px;text-align:right}
    .bn-cart-selected{outline:2px solid #102235;outline-offset:2px;border-radius:8px}
    .bn-cart-hint{font-size:12px;color:#607080;margin-top:6px}
    .bn-keypad-toggle[aria-checked="true"]{background:#102235;color:#fff;border-color:#102235}
    .bn-keypad-modes{display:flex;gap:5px;flex-wrap:wrap;margin-bottom:8px}
    .bn-keypad-modes button{border:1px solid #cfd9e3;background:#fff;border-radius:8px;padding:7px 9px;cursor:pointer}
    .bn-keypad-modes button[aria-pressed="true"]{background:#102235;color:#fff}
    .bn-keypad-modes [data-keypad-close]{margin-left:auto;color:#b42318}
  `;
  document.head.appendChild(style);

  let selected=-1;
  let buffer='';
  let cashBuffer='';
  let inputMode='quantity';
  let wrapping=false;

  const originalRenderCart=typeof renderCart==='function'?renderCart:null;

  function choose(index){
    selected=index;
    document.querySelectorAll('#cart .basketline').forEach((el,i)=>el.classList.toggle('bn-cart-selected',i===selected));
    const item=typeof cart!=='undefined'?cart[selected]:null;
    if(inputMode==='quantity') buffer=item?String(item.qty):'';
    updateDisplay();
  }

  function updateDisplay(){
    const out=document.querySelector('.bn-keypad-value');
    if(out) out.textContent=(inputMode==='cash'?cashBuffer:buffer)||'0';
  }

  function redraw(){
    if(originalRenderCart){
      wrapping=true;
      originalRenderCart();
      wrapping=false;
    }
    decorate();
  }

  function applyQuantity(){
    if(inputMode==='cash'){
      if(!cashBuffer||!/^\d+(,\d{1,2})?$/.test(cashBuffer)) return;
      window.bnCashTenderValue=cashBuffer;
      const hint=document.querySelector('.bn-cart-hint');
      if(hint) hint.textContent='Bargeldbetrag '+cashBuffer+' € wird im Zahlungsfenster übernommen.';
      return;
    }
    if(typeof cart==='undefined'||selected<0||!cart[selected]) return;
    const qty=Math.max(0,Math.floor(Number(buffer||0)));
    if(qty<=0) cart.splice(selected,1);
    else cart[selected].qty=qty;
    if(selected>=cart.length) selected=cart.length-1;
    buffer=selected>=0&&cart[selected]?String(cart[selected].qty):'';
    redraw();
  }

  function setKeypadOpen(tools,open){
    const panel=tools.querySelector('.bn-keypad-panel');
    const toggle=tools.querySelector('[data-keypad-toggle]');
    if(!panel||!toggle) return;
    panel.classList.toggle('open',open);
    toggle.setAttribute('aria-expanded',String(open));
    toggle.setAttribute('aria-checked',String(open));
    toggle.textContent=open?'Zahlenfeld: Ein':'Zahlenfeld: Aus';
  }

  function decorate(){
    const cartEl=document.getElementById('cart');
    if(!cartEl) return;
    const basket=cartEl.closest('.basket')||cartEl.parentElement;
    if(!basket) return;

    cartEl.querySelectorAll('.basketline').forEach((line,i)=>{
      line.style.cursor='pointer';
      line.onclick=()=>choose(i);
      line.classList.toggle('bn-cart-selected',i===selected);
    });

    let tools=basket.querySelector('.bn-cart-tools');
    if(!tools){
      tools=document.createElement('div');
      tools.className='bn-cart-tools';
      tools.innerHTML=`
        <div class="bn-cart-actions">
          <button type="button" data-cart-minus>− Menge</button>
          <button type="button" data-cart-plus>+ Menge</button>
          <button type="button" data-cart-delete>Artikel löschen</button>
          <button type="button" class="bn-keypad-toggle" data-keypad-toggle role="switch" aria-checked="false" aria-expanded="false">Zahlenfeld: Aus</button>
        </div>
        <div class="bn-keypad-panel" aria-label="Numerische Eingabe">
          <div class="bn-keypad-modes"><button type="button" data-input-mode="quantity" aria-pressed="true">Menge</button><button type="button" data-input-mode="cash" aria-pressed="false">Bargeld €</button><button type="button" data-keypad-close>Schließen ×</button></div>
          <div class="bn-keypad-display"><span class="bn-keypad-caption">Menge</span><span class="bn-keypad-value">0</span></div>
          <div class="bn-keypad" aria-label="Numerisches Eingabefeld">
            <button type="button" data-key="1">1</button><button type="button" data-key="2">2</button><button type="button" data-key="3">3</button>
            <button type="button" data-key="4">4</button><button type="button" data-key="5">5</button><button type="button" data-key="6">6</button>
            <button type="button" data-key="7">7</button><button type="button" data-key="8">8</button><button type="button" data-key="9">9</button>
            <button type="button" data-key="clear">C</button><button type="button" data-key="0">0</button><button type="button" data-key="back">⌫</button>
            <button type="button" data-key=",">,</button>
            <button type="button" data-key="ok" class="bn-ok" style="grid-column:1/-1">Übernehmen</button>
          </div>
        </div>
        <div class="bn-cart-hint">Artikel antippen, dann Menge über +/− oder das Zahlenfeld ändern.</div>`;
      basket.insertBefore(tools,cartEl);

      tools.querySelector('[data-keypad-toggle]').onclick=()=>{
        const open=!tools.querySelector('.bn-keypad-panel').classList.contains('open');
        setKeypadOpen(tools,open);
      };
      tools.querySelector('[data-keypad-close]').onclick=()=>setKeypadOpen(tools,false);
      tools.querySelectorAll('[data-input-mode]').forEach(btn=>btn.onclick=()=>{
        inputMode=btn.dataset.inputMode;
        tools.querySelectorAll('[data-input-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b===btn)));
        tools.querySelector('.bn-keypad-caption').textContent=inputMode==='cash'?'Bargeld €':'Menge';
        updateDisplay();
      });
      tools.querySelector('[data-cart-minus]').onclick=()=>{
        if(typeof cart==='undefined'||selected<0||!cart[selected]) return;
        cart[selected].qty--;
        if(cart[selected].qty<=0) cart.splice(selected,1);
        if(selected>=cart.length) selected=cart.length-1;
        buffer=selected>=0&&cart[selected]?String(cart[selected].qty):'';
        redraw();
      };
      tools.querySelector('[data-cart-plus]').onclick=()=>{
        if(typeof cart==='undefined'||selected<0||!cart[selected]) return;
        cart[selected].qty++;
        buffer=String(cart[selected].qty);
        redraw();
      };
      tools.querySelector('[data-cart-delete]').onclick=()=>{
        if(typeof cart==='undefined'||selected<0||!cart[selected]) return;
        cart.splice(selected,1);
        if(selected>=cart.length) selected=cart.length-1;
        buffer=selected>=0&&cart[selected]?String(cart[selected].qty):'';
        redraw();
      };
      tools.querySelectorAll('[data-key]').forEach(btn=>btn.onclick=()=>{
        const key=btn.dataset.key;
        let value=inputMode==='cash'?cashBuffer:buffer;
        if(key==='clear') value='';
        else if(key==='back') value=value.slice(0,-1);
        else if(key==='ok') return applyQuantity();
        else if(key===',') {if(inputMode==='cash'&&!value.includes(',')) value=(value||'0')+','}
        else if(inputMode!=='cash'||!value.includes(',')||value.split(',')[1].length<2) value=(value==='0'?'':value)+key;
        if(inputMode==='cash') cashBuffer=value; else buffer=value;
        updateDisplay();
      });
      setKeypadOpen(tools,false);
    }
    updateDisplay();
  }

  if(originalRenderCart){
    renderCart=function(){
      originalRenderCart();
      if(!wrapping) decorate();
    };
  }
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',decorate):decorate();
  new MutationObserver(()=>{ if(!wrapping) decorate(); }).observe(document.documentElement,{childList:true,subtree:true});
})();
