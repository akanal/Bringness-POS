(()=>{
  const TOKEN_KEY="bringness-waiter-token";
  let startedForToken=null;
  const token=()=>localStorage.getItem(TOKEN_KEY)||"";
  async function api(path,opt={}){
    const t=token();
    if(!t)throw Error("Nicht angemeldet");
    const r=await fetch("/api/v1"+path,{...opt,headers:{"content-type":"application/json",authorization:"Bearer "+t,...(opt.headers||{})}});
    const j=await r.json().catch(()=>({}));
    if(!r.ok)throw Error(j.error||"Fehler");
    return j;
  }
  const esc=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
  function fmt(v){return new Date(v).toLocaleString("de-DE",{weekday:"short",day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"})}
  function ensureScheduleCard(){
    const app=document.getElementById("app");
    if(!app)return null;
    let card=document.getElementById("myScheduleCard");
    if(card)return card;
    card=document.createElement("section");
    card.id="myScheduleCard";card.className="card";
    card.innerHTML='<div class="row"><div><h3 style="margin:0 0 5px">Meine nächsten Dienste</h3><p class="muted" style="margin:0">Der vom Restaurantbesitzer festgelegte Dienstplan.</p></div></div><div id="myScheduleList"><p class="muted">Dienstplan wird geladen …</p></div>';
    const firstGrid=document.getElementById("tables");
    if(firstGrid)app.insertBefore(card,firstGrid);else app.appendChild(card);
    return card;
  }
  async function refreshSchedule(){
    if(!token())return;
    const card=ensureScheduleCard(); if(!card)return;
    const host=card.querySelector("#myScheduleList");
    try{
      const j=await api("/waiter/schedule");
      const upcoming=(j.schedules||[]).filter(x=>new Date(x.ends_at)>new Date()).slice(0,12);
      host.innerHTML=upcoming.length?upcoming.map(x=>'<div class="item"><b>'+esc(fmt(x.starts_at))+' – '+esc(new Date(x.ends_at).toLocaleTimeString("de-DE",{hour:"2-digit",minute:"2-digit"}))+'</b><div class="muted">'+esc(x.restaurant_name||"")+(x.note?' · '+esc(x.note):'')+'</div></div>').join(""):'<p class="muted">Aktuell sind keine kommenden Dienste eingetragen.</p>';
    }catch(e){host.innerHTML='<p class="error">Dienstplan konnte nicht geladen werden: '+esc(e.message)+'</p>'}
  }
  async function startPresence(){
    const t=token(); if(!t||startedForToken===t)return;
    try{await api("/waiter/presence/start",{method:"POST",body:"{}"});startedForToken=t;await refreshSchedule()}catch(e){console.warn("Anwesenheit konnte nicht gestartet werden",e)}
  }
  function endPresence(){
    const t=token(); if(!t)return;
    fetch("/api/v1/waiter/presence/end",{method:"POST",headers:{"content-type":"application/json",authorization:"Bearer "+t},body:"{}",keepalive:true}).catch(()=>{});
    startedForToken=null;
  }
  document.addEventListener("click",e=>{
    if(e.target?.id==="logout")endPresence();
  },true);
  window.addEventListener("pagehide",()=>{
    if(document.visibilityState==="hidden")return;
  });
  const timer=setInterval(()=>{
    const app=document.getElementById("app");
    if(token()&&app&&!app.hidden)startPresence();
    if(!token()){startedForToken=null;const card=document.getElementById("myScheduleCard");if(card)card.remove()}
  },800);
  window.addEventListener("beforeunload",()=>clearInterval(timer));
})();