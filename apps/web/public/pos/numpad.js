(()=>{
  const style=document.createElement('style');
  style.textContent=`
    .bn-cart-tools{border-top:1px solid #dce5ee;margin-top:10px;padding-top:10px}
    .bn-cart-actions{display:flex;gap:7px;flex-wrap:wrap;margin-bottom:8px}
    .bn-cart-actions button,.bn-keypad-toggle{min-height:38px;border:1px solid #cfd9e3;border-radius:10px;background:#fff;font-weight:800;padding:7px 10px;cursor:pointer}
    .bn-keypad{display:none;grid-template-columns:repeat(3,minmax(52px,1fr));gap:7px;margin-top:8px;max-width:260px}
    .bn-keypad.open{display:grid}
    .bn-keypad button{min-height:46px;border:1px solid #cfd9e3;border-radius:10px;background:#f8fafc;font-size:18px;font-weight:900;cursor:pointer}
    .bn-keypad button.bn-ok{background:#102235;color:#fff}
    .bn-keypad-display{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:8px}
    .bn-keypad-value{font-variant-numeric:tabular-nums;font-size:20px;font-weight:900;min-width:90px;text-align:right}
    .bn-cart-selected{outline:2px solid #102235;outline-offset:2px;border-radius:8px}
    .bn-cart-hint{font-size:12px;color:#607080;margin-top:6px}
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
    if(out) out.textContent=buffer||'0';
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
    if(typeof cart==='undefined'||selected<0||!cart[selected]) return;
    const qty=Math.max(0,Math.floor(Number(buffer||0)));
    if(qty<=0) cart.splice(selected,1);
    else cart[selected].qty=qty;
    if(selected>=cart.length) selected=cart.length-1;
    buffer=selected>=0&&cart[selected]?String(cart[selected].qty):'';
    redraw();
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
          <button type="button" class="bn-keypad-toggle" data-keypad-toggle>Zahlenfeld</button>
        </div>
        <div class="bn-keypad-display"><span>Menge / Zahl</span><span class="bn-keypad-value">0</span></div>
        <div class="bn-keypad" aria-label="Numerisches Eingabefeld">
          <button type="button" data-key="1">1</button><button type="button" data-key="2">2</button><button type="button" data-key="3">3</button>
          <button type="button" data-key="4">4</button><button type="button" data-key="5">5</button><button type="button" data-key="6">6</button>
          <button type="button" data-key="7">7</button><button type="button" data-key="8">8</button><button type="button" data-key="9">9</button>
          <button type="button" data-key="clear">C</button><button type="button" data-key="0">0</button><button type="button" data-key="back">⌫</button>
          <button type="button" data-key="ok" class="bn-ok" style="grid-column:1/-1">Übernehmen</button>
        </div>
        <div class="bn-cart-hint">Artikel antippen, dann Menge über +/− oder das Zahlenfeld ändern.</div>`;
      basket.appendChild(tools);

      tools.querySelector('[data-keypad-toggle]').onclick=()=>tools.querySelector('.bn-keypad').classList.toggle('open');
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
        if(key==='clear') buffer='';
        else if(key==='back') buffer=buffer.slice(0,-1);
        else if(key==='ok') return applyQuantity();
        else buffer=(buffer==='0'?'':buffer)+key;
        updateDisplay();
      });
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