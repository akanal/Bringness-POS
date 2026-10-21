(()=>{
function localDateTime(date,time){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))throw Error('Bitte Datum und Uhrzeit im 24-Stunden-Format HH:MM eingeben.');
 const value=new Date(date+'T'+time),[year,month,day]=date.split('-').map(Number),[hour,minute]=time.split(':').map(Number);
 if(!Number.isFinite(value.getTime())||value.getFullYear()!==year||value.getMonth()!==month-1||value.getDate()!==day||value.getHours()!==hour||value.getMinutes()!==minute)throw Error('Diese Ortszeit ist ungültig oder existiert wegen der Zeitumstellung nicht. Bitte korrigieren Sie Datum oder Uhrzeit.');
 return value;
}

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

  async function receiptQr(id,number){
    const r=await fetch("/api/v1/receipts/"+encodeURIComponent(id)+"/number-qr",{headers:{authorization:"Bearer "+token()}});
    if(!r.ok){const e=await r.json().catch(()=>({}));throw Error(e.error||"QR-Code nicht verfügbar")}
    const svg=await r.text();
    const link=r.headers.get("x-receipt-url");
    const overlay=document.createElement("div");overlay.style.cssText="position:fixed;inset:0;background:#07182c99;z-index:11000;display:grid;place-items:center;padding:18px";
    overlay.innerHTML='<div style="background:#fff;border-radius:18px;padding:24px;max-width:360px;text-align:center"><h3 style="margin-top:0">Digitaler Beleg</h3><div style="max-width:260px;margin:auto">'+svg+'</div><p><b>'+esc(number)+'</b></p><p class="muted">Scannen öffnet den vollständigen Beleg im Browser.</p>'+(link?'<p><a href="'+esc(link)+'" target="_blank" rel="noopener noreferrer">Beleg im Browser öffnen</a></p>':'')+'<button type="button">Schließen</button></div>';
    overlay.querySelector("button").onclick=()=>overlay.remove();overlay.onclick=e=>{if(e.target===overlay)overlay.remove()};document.body.appendChild(overlay);
  }
  function enhanceReceipts(){
    const area=body();if(!area)return;
    area.querySelectorAll("[data-receipt]").forEach(pdf=>{
      if(pdf.parentElement.querySelector("[data-receipt-qr]"))return;
      const b=document.createElement("button");b.type="button";b.dataset.receiptQr=pdf.dataset.receipt;b.textContent="QR-Beleg öffnen";b.style.marginLeft="7px";
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

  const mins=d=>d.getHours()*60+d.getMinutes();
  const duration=(a,b)=>Math.round((b-a)/60000);
  function sameWeeklyPattern(x,employeeId,start,end){
    const xs=new Date(x.starts_at),xe=new Date(x.ends_at);
    return String(x.employee_id)===String(employeeId)&&xs.getDay()===start.getDay()&&Math.abs(mins(xs)-mins(start))<=5&&Math.abs(duration(xs,xe)-duration(start,end))<=5;
  }
  async function extendRecognizedPattern(existing,payload,start,end){
    const matches=existing.filter(x=>sameWeeklyPattern(x,payload.employeeId,start,end));
    if(matches.length<2)return 0;
    let created=0;
    for(let week=1;week<=4;week++){
      const s=new Date(start.getTime()+week*7*86400000),e=new Date(end.getTime()+week*7*86400000);
      const duplicate=existing.some(x=>String(x.employee_id)===String(payload.employeeId)&&Math.abs(new Date(x.starts_at)-s)<5*60000);
      if(duplicate)continue;
      await api("/owner/schedules",{method:"POST",body:JSON.stringify({...payload,startsAt:s.toISOString(),endsAt:e.toISOString(),recurrence:"auto-weekly"})});
      created++;
    }
    return created;
  }

  async function renderShift(){
    const area=body();if(!area)return;const restaurantId=rid();
    const [waiters,presence,schedules]=await Promise.all([api("/personnel/employees?restaurantId="+encodeURIComponent(restaurantId)),api("/owner/presence?restaurantId="+encodeURIComponent(restaurantId)),api("/owner/schedules?restaurantId="+encodeURIComponent(restaurantId))]);
    const people=waiters.employees||[],activeIds=new Set(people.filter(x=>x.active).map(x=>x.id)),existing=schedules.schedules||[],upcoming=existing.filter(x=>activeIds.has(x.employee_id)&&Date.parse(x.ends_at)>Date.now());
    area.innerHTML='<div class="modulegrid"><div class="modulecard"><b>Service-Anmeldungen</b><p class="muted">Login und Logout dokumentieren den Servicezugang. Arbeitszeiten werden separat in der Zeiterfassung gebucht.</p><div id="presenceList"></div></div><div class="modulecard"><b>Dienstplan</b><p class="muted">Schichten festlegen; Kellner sehen ihre kommenden Dienste beim Login. Wiederholt sich derselbe Wochentag mit derselben Uhrzeit mindestens dreimal, führt Bringness diesen Rhythmus automatisch für vier weitere Wochen fort.</p><form id="scheduleForm" style="display:grid;gap:8px"><select id="scheduleEmployee" required><option value="">Mitarbeiter wählen</option>'+people.filter(x=>x.active).map(x=>'<option value="'+esc(x.id)+'">'+esc(x.display_name)+'</option>').join("")+'</select><label>Beginn – Datum<input id="scheduleStartDate" type="date" required></label><label>Beginn – Uhrzeit<input id="scheduleStartTime" type="text" placeholder="HH:MM" pattern="([01][0-9]|2[0-3]):[0-5][0-9]" maxlength="5" title="24-Stunden-Format, z. B. 09:00 oder 22:30" required></label><label>Ende – Datum<input id="scheduleEndDate" type="date" required></label><label>Ende – Uhrzeit<input id="scheduleEndTime" type="text" placeholder="HH:MM" pattern="([01][0-9]|2[0-3]):[0-5][0-9]" maxlength="5" title="24-Stunden-Format, z. B. 09:00 oder 22:30" required></label><input id="scheduleNote" maxlength="300" placeholder="Hinweis, z. B. Terrasse"><button type="submit">Dienst eintragen</button></form></div></div><div class="modulecard" style="margin-top:12px"><b>Kommende Dienste</b><div id="scheduleList"></div></div>';
    document.getElementById("presenceList").innerHTML=(presence.presence||[]).filter(x=>activeIds.has(x.employee_id)&&!x.ended_at).map(x=>'<p><b>'+esc(x.display_name)+'</b> · '+new Date(x.started_at).toLocaleString("de-DE",{hourCycle:"h23"})+' – '+(x.ended_at?new Date(x.ended_at).toLocaleString("de-DE",{hourCycle:"h23"}):'anwesend')+'</p>').join("")||'<p class="muted">Noch keine Anwesenheitsdaten.</p>';
    document.getElementById("scheduleList").innerHTML=upcoming.map(x=>'<p><b>'+esc(x.display_name)+'</b> · '+new Date(x.starts_at).toLocaleString("de-DE",{hourCycle:"h23"})+' – '+new Date(x.ends_at).toLocaleString("de-DE",{hourCycle:"h23"})+(x.note?' · '+esc(x.note):'')+(x.recurrence==='auto-weekly'?' · <span class="muted">automatisch fortgeführt</span>':'')+'</p>').join("")||'<p class="muted">Noch keine Dienste geplant.</p>';
    document.getElementById("scheduleForm").onsubmit=async e=>{
      e.preventDefault();
      try{
        const employeeId=document.getElementById("scheduleEmployee").value,start=localDateTime(document.getElementById("scheduleStartDate").value,document.getElementById("scheduleStartTime").value),end=localDateTime(document.getElementById("scheduleEndDate").value,document.getElementById("scheduleEndTime").value);
        if(end<=start)throw Error("Das Ende muss nach dem Beginn liegen.");
        const payload={restaurantId,employeeId,startsAt:start.toISOString(),endsAt:end.toISOString(),note:document.getElementById("scheduleNote").value};
        await api("/owner/schedules",{method:"POST",body:JSON.stringify(payload)});
        const autoCreated=await extendRecognizedPattern(existing,payload,start,end);
        if(autoCreated)alert("Dienstplan-Muster erkannt: "+autoCreated+" weitere Dienste wurden automatisch angelegt.");
        await renderShift();
      }catch(err){alert(err.message)}
    };
  }

  function hook(){

    const original=window.showModule;
    if(typeof original!=="function"||original.__roWrapped)return setTimeout(hook,250);
    const wrapped=async function(v,...options){const out=await original(v,...options);if(document.body.dataset.posView!==v)return out;try{if(v==="belege")enhanceReceipts();if(v==="varianten")await renderVariants();if(v==="dienstplan")await renderShift()}catch(e){console.error(e);if(body())body().insertAdjacentHTML("beforeend",'<div class="modulecard">Zusatzfunktion: '+esc(e.message)+'</div>')}return out};
    wrapped.__roWrapped=true;window.showModule=wrapped;
  }
  hook();
})();

