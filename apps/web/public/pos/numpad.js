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
    .bn-cart-menu{position:relative;margin-left:auto}.bn-cart-menu summary{cursor:pointer;list-style:none;padding:4px 8px;font-size:18px}
    .bn-cart-menu summary::-webkit-details-marker{display:none}.bn-cart-menu>div{position:absolute;right:0;z-index:15;display:grid;min-width:145px;padding:6px;background:#fff;border:1px solid #dce5ee;border-radius:9px;box-shadow:0 8px 22px #10223522}
    .bn-cart-menu button{text-align:left;background:#fff;padding:8px}.bn-cart-menu button:hover{background:#f1f5f8}
  `;
  document.head.appendChild(style);

  let selected=-1;
  let buffer='';
  let wrapping=false;

  const originalRenderCart=typeof renderCart==='function'?renderCart:null;

  function choose(index){
    selected=index;
    document.querySelectorAll('#cart .basketline').forEach((el,i)=>el.classList.toggle('bn-cart-selected',i===selected));
    const item=typeof cart!=='undefined'?cart[selected]:null;
    buffer=item?String(item.qty):'';
    updateDisplay();
  }

  function updateDisplay(){
    const out=document.querySelector('.bn-keypad-value');
    const value=buffer||'0';
    if(out && out.textContent!==value) out.textContent=value;
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
    const hint=document.querySelector('.bn-cart-hint');
    if(!buffer){if(hint)hint.textContent='Bitte zuerst eine Zahl eingeben.';return}
    if(buffer.includes(',')){
      if(!/^\d+,\d{1,2}$/.test(buffer)) return;
      window.bnCashTenderValue=buffer;
      if(hint) hint.textContent='Betrag '+buffer+' € wird im Zahlungsfenster übernommen.';
      return;
    }
    if(typeof cart==='undefined'||!cart.length){if(hint)hint.textContent='Bitte zuerst eine Speise zur Bestellung hinzufügen.';return}
    if(selected<0||!cart[selected]) selected=cart.length-1;
    const qty=Math.max(0,Math.floor(Number(buffer||0)));
    if(qty<=0) cart.splice(selected,1);
    else cart[selected].qty=qty;
    if(selected>=cart.length) selected=cart.length-1;
    buffer=selected>=0&&cart[selected]?String(cart[selected].qty):'';
    redraw();
    if(hint) hint.textContent=selected>=0?'Menge übernommen: '+cart[selected].qty:'Artikel entfernt.';
  }

  function setKeypadOpen(tools,open){
    const panel=tools.querySelector('.bn-keypad-panel');
    const toggle=tools.querySelector('[data-keypad-toggle]');
    if(!panel||!toggle) return;
    panel.classList.toggle('open',open);
    toggle.setAttribute('aria-expanded',String(open));
    toggle.setAttribute('aria-checked',String(open));
    toggle.textContent=open?'Zahlenfeld: Ein':'Zahlenfeld: Aus';
    if(open){
      if(typeof cart!=='undefined' && cart.length && (selected<0||!cart[selected])) choose(cart.length-1);
      buffer='';
      updateDisplay();
    }
  }

  function decorate(){
    const cartEl=document.getElementById('cart');
    if(!cartEl) return;
    const basket=cartEl.closest('.basket')||cartEl.parentElement;
    if(!basket) return;

    cartEl.querySelectorAll('.basketline').forEach((line,i)=>{
      line.style.cursor='pointer';
      line.onclick=e=>{if(!e.target.closest('.bn-cart-menu')) choose(i)};
      line.classList.toggle('bn-cart-selected',i===selected);
      if(!line.querySelector('.bn-cart-menu')){
        const menu=document.createElement('details');
        menu.className='bn-cart-menu';
        menu.innerHTML='<summary aria-label="Artikelaktionen">⋮</summary><div><button type="button" data-action="minus">− Menge</button><button type="button" data-action="plus">+ Menge</button><button type="button" data-action="delete">Löschen</button></div>';
        line.appendChild(menu);
        menu.querySelectorAll('[data-action]').forEach(btn=>btn.onclick=e=>{
          e.stopPropagation();choose(i);
          const action=btn.dataset.action;
          if(action==='delete')cart.splice(i,1);
          else if(action==='plus')cart[i].qty++;
          else if(--cart[i].qty<=0)cart.splice(i,1);
          selected=Math.min(i,cart.length-1);
          buffer=selected>=0?String(cart[selected].qty):'';
          redraw();
        });
      }
    });

    let tools=basket.querySelector('.bn-cart-tools');
    if(!tools){
      tools=document.createElement('div');
      tools.className='bn-cart-tools';
      tools.innerHTML=`
        <div class="bn-cart-actions">
          <button type="button" class="bn-keypad-toggle" data-keypad-toggle role="switch" aria-checked="false" aria-expanded="false">Zahlenfeld: Aus</button>
        </div>
        <div class="bn-keypad-panel" aria-label="Numerische Eingabe">
          <div class="bn-keypad-display"><span>Menge eingeben</span><span class="bn-keypad-value">0</span></div>
          <div class="bn-keypad" aria-label="Numerisches Eingabefeld">
            <button type="button" data-key="1">1</button><button type="button" data-key="2">2</button><button type="button" data-key="3">3</button>
            <button type="button" data-key="4">4</button><button type="button" data-key="5">5</button><button type="button" data-key="6">6</button>
            <button type="button" data-key="7">7</button><button type="button" data-key="8">8</button><button type="button" data-key="9">9</button>
            <button type="button" data-key="clear">C</button><button type="button" data-key="0">0</button><button type="button" data-key="back">⌫</button>
            <button type="button" data-key=",">,</button>
            <button type="button" data-key="ok" class="bn-ok" style="grid-column:1/-1">Übernehmen</button>
          </div>
        </div>
        <div class="bn-cart-hint">Speise antippen, Zahl eingeben und übernehmen. Komma für Bargeldbetrag.</div>`;
      basket.insertBefore(tools,cartEl);

      tools.querySelector('[data-keypad-toggle]').onclick=()=>{
        const open=!tools.querySelector('.bn-keypad-panel').classList.contains('open');
        setKeypadOpen(tools,open);
      };
      tools.querySelectorAll('[data-key]').forEach(btn=>btn.onclick=()=>{
        const key=btn.dataset.key;
        let value=buffer;
        if(key==='clear'){value='';window.bnCashTenderValue=''}
        else if(key==='back') value=value.slice(0,-1);
        else if(key==='ok') return applyQuantity();
        else if(key===',') {if(!value.includes(',')) value=(value||'0')+','}
        else if(!value.includes(',')||value.split(',')[1].length<2) value=(value==='0'?'':value)+key;
        buffer=value;
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
})();
