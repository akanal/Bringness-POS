(()=>{
  let started=false;
  const token=()=>localStorage.getItem("bringness-waiter-token");
  async function api(path,opt={}){const t=token();if(!t)throw Error("Nicht angemeldet");const r=await fetch("/api/v1"+path,{...opt,headers:{"content-type":"application/json",authorization:"Bearer "+t,...(opt.headers||{})}}),j=await r.json().catch(()=>({}));if(!r.ok)throw Error(j.error||"Fehler");return j}
  function esc(s){return String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]))}
  async function mountSchedule(){
    if(document.getElementById("waiterScheduleCard"))return;
    const app=document.getElementById("app");if(!app||app.hidden)return;
    try{
      const j=await api("/waiter/schedule"),card=document.createElement("section");card.id="waiterScheduleCard";card.className="card";
      card.innerHTML='<h3>Mein Dienstplan</h3><div>'+((j.schedules||[]).map(x=>'<p><b>'+new Date(x.starts_at).toLocaleString("de-DE")+'</b> – '+new Date(x.ends_at).toLocaleString("de-DE")+'<br><span class="muted">'+esc(x.restaurant_name)+(x.note?' · '+esc(x.note):'')+'</span></p>').join("")||'<p class="muted">Aktuell sind keine kommenden Dienste eingetragen.</p>')+'</div>';
      app.insertBefore(card,app.firstChild);
    }catch(e){}
  }
  async function start(){
    if(started||!token())return;
    const app=document.getElementById("app");if(!app||app.hidden)return;
    try{await api("/waiter/presence/start",{method:"POST",body:"{}"});started=true;mountSchedule()}catch(e){}
  }
  const logout=document.getElementById("logout");
  if(logout)logout.addEventListener("click",()=>{const t=token();if(!t)return;fetch("/api/v1/waiter/presence/end",{method:"POST",headers:{"content-type":"application/json",authorization:"Bearer "+t},body:"{}",keepalive:true}).catch(()=>{})},true);
  setInterval(start,1000);start();
})();