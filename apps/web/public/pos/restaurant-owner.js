(()=>{
  const token=()=>localStorage.getItem("bringness-pos-token");
  const esc=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
  const euro=c=>(Number(c||0)/100).toLocaleString("de-DE",{style:"currency",currency:"EUR"});
  async function api(path,opt={}){
    opt.headers={...(opt.headers||{}),"content-type":"application/json",...(token()?{authorization:"Bearer "+token()}:{})};
    const r=await fetch("/api/v1"+path,opt),j=await r.json().catch(()=>({}));
    if(!r.ok)throw Error(j.error||"Fehler"); return j;
  }
  function rid(){return document.getElementById("restaurant")?.value||""}
  function body(){return document.getElementById("moduleBody")}

  function addImpressumLink(){
    const menu=document.getElementById("userMenu");
    if(menu&&!menu.querySelector('[data-impressum-link]')){
      const a=document.createElement("a");a.href="/impressum";a.dataset.impressumLink="1";a.textContent="Impressum";menu.appendChild(a);
    }
  }

  async function receiptQr(id,number){
    const r=await fetch("/api/v1/receipts/"+encodeURIComponent(id)+"/number-qr",{headers:{authorization:"Bearer "+token()}});
    if(!r.ok){const e=await r.json().catch(()=>({}));throw Error(e.error||"QR-Code nicht verfügbar")}
    const svg=await r.text();
    const overlay=document.createElement("div");overlay.style.cssText="position:fixed;inset:0;background:#07182c99;z-index:11000;display:grid;place-items:center;padding:18px";
    overlay.innerHTML='<div style="background:#fff;border-radius:18px;padding:24px;max-width:360px;text-align:center"><h3 style="margin-top:0">Scanbare Belegnummer</h3><div style="max-width:260px;margin:auto">'+svg+'</div><p><b>'+esc(number)+'</b></p><p class="muted">Der QR-Code enthält die fortlaufende Belegnummer.</p><button type="button">Schließen</button></div>';
    overlay.querySelector("button").onclick=()=>overlay.remove();overlay.onclick=e=>{if(e.target===overlay)overlay.remove()};document.body.appendChild(overlay);
  }
  function enhanceReceipts(){
    const area=body();if(!area)return;
    area.querySelectorAll("[data-receipt]").forEach(pdf=>{
      if(pdf.parentElement.querySelector("[data-receipt-qr]"))return;
      const b=document.createElement("button");b.type="button";b.dataset.receiptQr=pdf.dataset.receipt;b.textContent="QR Belegnummer";b.style.marginLeft="7px";
      b.onclick=()=>receiptQr(pdf.dataset.receipt,pdf.dataset.number).catch(e=>alert(e.message));pdf.parentElement.appendChild(b);
    });
  }

  async function renderVariants(){
    const area=body();if(!area)return;
    const bootstrap=await api("/bootstrap"),restaurantId=rid(),products=(bootstrap.products||[]).filter(p=>p.restaurantId===restaurantId);
    area.innerHTML='<div class="modulecard"><b>Beilagen & Extras</b><p class="muted">Hier legst du Extras mit Aufpreis direkt pro Speise an, z. B. Pilze +0,50 € oder Gorgonzola +1,00 €.</p></div><div id="roExtras"></div>';
    const host=document.getElementById("roExtras");
    if(!products.length){host.innerHTML='<div class="modulecard">Noch keine Speisen vorhanden.</div>';return}
    for(const p of products){
      const d=await api("/products/"+encodeURIComponent(p.id)+"/extras");
      const card=document.createElement("div");card.className="modulecard";card.style.marginTop="10px";
      card.innerHTML='<b>'+esc(p.name)+'</b><div data-extra-list>'+((d.extras||[]).filter(x=>x.active).map(x=>'<div style="display:flex;justify-content:space-between;gap:8px;padding:6px 0"><span>'+esc(x.name)+' · +'+euro(x.price_cents)+'</span><button type="button" data-extra-delete="'+esc(x.id)+'">Entfernen</button></div>').join("")||'<p class="muted">Noch keine Beilagen.</p>')+'</div><form data-extra-form style="display:flex;gap:7px;flex-wrap:wrap;margin-top:9px"><input name="name" required maxlength="100" placeholder="z. B. Pilze"><input name="price" required type="number" min="0" step="0.01" placeholder="Aufpreis €"><button type="submit">Hinzufügen</button></form>';
      card.querySelector("[data-extra-form]").onsubmit=async e=>{e.preventDefault();const fd=new FormData(e.currentTarget),price=Number(fd.get("price"));try{await api("/products/"+encodeURIComponent(p.id)+"/extras",{method:"POST",body:JSON.stringify({name:fd.get("name"),priceCents:Math.round(price*100)})});await renderVariants()}catch(err){alert(err.message)}};
      card.querySelectorAll("[data-extra-delete]").forEach(b=>b.onclick=async()=>{try{await api("/product-extras/"+encodeURIComponent(b.dataset.extraDelete),{method:"DELETE"});await renderVariants()}catch(err){alert(err.message)}});
      host.appendChild(card);
    }
  }

  async function renderShift(){
    const area=body();if(!area)return;const restaurantId=rid();
    const [waiters,presence,schedules]=await Promise.all([api("/waiters?restaurantId="+encodeURIComponent(restaurantId)),api("/owner/presence?restaurantId="+encodeURIComponent(restaurantId)),api("/owner/schedules?restaurantId="+encodeURIComponent(restaurantId))]);
    const people=waiters.waiters||[];
    area.innerHTML='<div class="modulegrid"><div class="modulecard"><b>Anwesenheit Kellner</b><p class="muted">Login und Logout werden als Anwesenheitszeit protokolliert.</p><div id="presenceList"></div></div><div class="modulecard"><b>Dienstplan</b><p class="muted">Schichten festlegen; Kellner sehen ihre kommenden Dienste beim Login.</p><form id="scheduleForm" style="display:grid;gap:8px"><select id="scheduleEmployee" required><option value="">Kellner wählen</option>'+people.filter(x=>x.active).map(x=>'<option value="'+esc(x.id)+'">'+esc(x.display_name)+'</option>').join("")+'</select><label>Beginn<input id="scheduleStart" type="datetime-local" required></label><label>Ende<input id="scheduleEnd" type="datetime-local" required></label><input id="scheduleNote" maxlength="300" placeholder="Hinweis, z. B. Terrasse"><button type="submit">Dienst eintragen</button></form></div></div><div class="modulecard" style="margin-top:12px"><b>Kommende Dienste</b><div id="scheduleList"></div></div>';
    document.getElementById("presenceList").innerHTML=(presence.presence||[]).map(x=>'<p><b>'+esc(x.display_name)+'</b> · '+new Date(x.started_at).toLocaleString("de-DE")+' – '+(x.ended_at?new Date(x.ended_at).toLocaleString("de-DE"):'anwesend')+'</p>').join("")||'<p class="muted">Noch keine Anwesenheitsdaten.</p>';
    document.getElementById("scheduleList").innerHTML=(schedules.schedules||[]).map(x=>'<p><b>'+esc(x.display_name)+'</b> · '+new Date(x.starts_at).toLocaleString("de-DE")+' – '+new Date(x.ends_at).toLocaleString("de-DE")+(x.note?' · '+esc(x.note):'')+'</p>').join("")||'<p class="muted">Noch keine Dienste geplant.</p>';
    document.getElementById("scheduleForm").onsubmit=async e=>{e.preventDefault();try{await api("/owner/schedules",{method:"POST",body:JSON.stringify({restaurantId,employeeId:document.getElementById("scheduleEmployee").value,startsAt:new Date(document.getElementById("scheduleStart").value).toISOString(),endsAt:new Date(document.getElementById("scheduleEnd").value).toISOString(),note:document.getElementById("scheduleNote").value})});await renderShift()}catch(err){alert(err.message)}};
  }

  function explainTableHistory(){
    const area=body();if(!area||area.querySelector("[data-history-note]"))return;
    const note=document.createElement("div");note.className="modulecard";note.dataset.historyNote="1";note.innerHTML='<b>Zahlungsverlauf</b><p class="muted">In der Tischansicht werden nur Vorgänge der letzten 24 Stunden angezeigt. Steuerlich relevante Beleg- und Zahlungsdaten werden dabei nicht aus der Datenbank gelöscht.</p>';
    area.prepend(note);
  }

  function hook(){
    addImpressumLink();
    const original=window.showModule;
    if(typeof original!=="function"||original.__roWrapped)return setTimeout(hook,250);
    const wrapped=async function(v){const out=await original(v);try{if(v==="belege")enhanceReceipts();if(v==="varianten")await renderVariants();if(v==="schicht")await renderShift();if(v==="tische")explainTableHistory()}catch(e){console.error(e);if(body())body().insertAdjacentHTML("beforeend",'<div class="modulecard">Zusatzfunktion: '+esc(e.message)+'</div>')}return out};
    wrapped.__roWrapped=true;window.showModule=wrapped;
  }
  hook();
})();