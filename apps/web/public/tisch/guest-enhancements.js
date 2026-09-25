(()=>{
  const code=new URLSearchParams(location.search).get("code");
  if(!code)return;
  const chosen=new Map();
  const originalFetch=window.fetch.bind(window);
  let extrasByProduct=new Map();

  function esc(s){return String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]))}
  function euro(c){return (Number(c||0)/100).toLocaleString("de-DE",{style:"currency",currency:"EUR"})}

  async function loadExtras(){
    try{
      const r=await originalFetch("/api/v1/guest/extras?code="+encodeURIComponent(code),{cache:"no-store"}),j=await r.json();
      if(!r.ok)return;
      extrasByProduct=new Map();
      for(const x of j.extras||[]){const list=extrasByProduct.get(x.product_id)||[];list.push(x);extrasByProduct.set(x.product_id,list)}
      enhanceButtons();
    }catch{}
  }

  function chooseExtras(productId,productName,originalAdd){
    const extras=extrasByProduct.get(productId)||[];
    if(!extras.length){originalAdd();return}
    const overlay=document.createElement("div");overlay.style.cssText="position:fixed;inset:0;background:#07182c99;z-index:12000;display:grid;place-items:center;padding:16px";
    const current=new Set(chosen.get(productId)||[]);
    overlay.innerHTML='<div style="background:#fff;border-radius:18px;padding:22px;width:min(480px,100%);max-height:85vh;overflow:auto"><h2 style="margin-top:0">'+esc(productName)+'</h2><p>Beilagen & Extras auswählen</p><div>'+extras.map(x=>'<label style="display:flex;justify-content:space-between;gap:12px;padding:10px 0;border-bottom:1px solid #eee"><span><input type="checkbox" value="'+esc(x.id)+'" '+(current.has(x.id)?'checked':'')+'> '+esc(x.name)+'</span><b>+'+euro(x.price_cents)+'</b></label>').join("")+'</div><div style="display:flex;justify-content:flex-end;gap:8px;margin-top:14px"><button data-cancel type="button">Abbrechen</button><button data-add type="button" style="background:#ff7628;color:#fff;border:0;border-radius:10px;padding:11px 15px;font-weight:800">Hinzufügen</button></div></div>';
    overlay.querySelector("[data-cancel]").onclick=()=>overlay.remove();
    overlay.querySelector("[data-add]").onclick=()=>{chosen.set(productId,[...overlay.querySelectorAll('input[type="checkbox"]:checked')].map(x=>x.value));overlay.remove();originalAdd()};
    overlay.onclick=e=>{if(e.target===overlay)overlay.remove()};document.body.appendChild(overlay);
  }

  function enhanceButtons(){
    document.querySelectorAll("[data-add]").forEach(btn=>{
      if(btn.dataset.extrasReady)return;
      btn.dataset.extrasReady="1";
      const productId=btn.dataset.add,original=btn.onclick;
      if(typeof original!=="function")return;
      btn.onclick=e=>{e.preventDefault();e.stopPropagation();chooseExtras(productId,btn.getAttribute("aria-label")?.replace(" hinzufügen","")||"Speise",()=>original.call(btn,e))};
    });
  }

  function addEmail(){
    if(document.getElementById("guestReceiptEmail"))return;
    const send=document.getElementById("send");if(!send)return;
    const p=document.createElement("div");p.style.margin="14px 0";
    p.innerHTML='<label style="display:block;font-weight:700">E-Mail für digitalen Beleg (optional)<input id="guestReceiptEmail" type="email" autocomplete="email" placeholder="name@beispiel.de" style="display:block;width:100%;box-sizing:border-box;margin-top:6px;padding:11px;border:1px solid #d6dde5;border-radius:9px"></label><small class="muted">Die Adresse wird nur dieser Bestellung zugeordnet. Der automatische E-Mail-Versand wird aktiv, sobald der Mailanbieter verbunden ist.</small>';
    send.parentElement.insertBefore(p,send);
  }

  function lockAfterOrder(){
    sessionStorage.setItem("bringness-order-complete-"+code,"1");
    history.replaceState({},"","/tisch/abgeschlossen");
    const menu=document.getElementById("menu"),send=document.getElementById("send"),basket=document.getElementById("basket");
    if(menu)menu.innerHTML='<div style="text-align:center;padding:28px"><h2>Bestellung übermittelt</h2><p>Für eine neue Bestellung bitte den QR-Code am Tisch erneut scannen.</p></div>';
    if(basket)basket.innerHTML="Bestellung abgeschlossen.";
    if(send)send.disabled=true;
  }

  window.fetch=async function(input,init={}){
    const url=typeof input==="string"?input:(input?.url||"");
    if(url==="/api/v1/guest/order" || url.endsWith("/api/v1/guest/order")){
      let body={};try{body=JSON.parse(init.body||"{}")}catch{}
      body.items=(body.items||[]).map(i=>({...i,extraIds:chosen.get(String(i.productId))||[]}));
      body.email=document.getElementById("guestReceiptEmail")?.value.trim()||"";
      const r=await originalFetch("/api/v1/guest/order-v2",{...init,body:JSON.stringify(body)});
      if(r.ok)setTimeout(lockAfterOrder,50);
      return r;
    }
    return originalFetch(input,init);
  };

  const observer=new MutationObserver(()=>{enhanceButtons();addEmail()});
  observer.observe(document.documentElement,{subtree:true,childList:true});
  addEmail();loadExtras();
})();