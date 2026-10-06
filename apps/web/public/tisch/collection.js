(()=>{
  const params=new URLSearchParams(location.search);
  const code=params.get("code")||params.get("collection");
  if(!code)return;
  const key="bringness-collection-"+code;
  let orders=[],audio=null,busy=false,mode="restaurant";
  try{orders=JSON.parse(sessionStorage.getItem(key)||"[]").filter(o=>o.orderId&&o.requestId).slice(-40)}catch{}
  const save=()=>{try{sessionStorage.setItem(key,JSON.stringify(orders))}catch{}};
  function unlock(){
    try{const C=window.AudioContext||window.webkitAudioContext;if(C){audio ||= new C();audio.resume().catch(()=>{})}}catch{}
  }
  document.addEventListener("pointerdown",unlock,{passive:true});
  function signal(){
    try{
      if(audio?.state==="running"){
        const start=audio.currentTime;
        [880,1174,880].forEach((hz,i)=>{
          const o=audio.createOscillator(),g=audio.createGain(),t=start+i*.28;
          o.frequency.value=hz;g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(.18,t+.02);g.gain.exponentialRampToValueAtTime(.0001,t+.23);
          o.connect(g);g.connect(audio.destination);o.start(t);o.stop(t+.25);
        });
      }
    }catch{}
    try{navigator.vibrate?.([300,100,300])}catch{}
  }
  function render(){
    let host=document.getElementById("guestCollection");
    if(mode!=="pickup"&&!orders.some(o=>o.mode==="pickup"))return;
    if(!host){host=document.createElement("div");host.id="guestCollection";host.setAttribute("aria-live","polite");host.style.cssText="margin:16px 0;padding:18px;background:#fff3e7;border-radius:14px;font-size:20px;font-weight:700";(document.getElementById("status")?.parentElement||document.body).appendChild(host)}
    host.replaceChildren();
    const visible=orders.filter(o=>o.mode==="pickup"&&(!o.closed||o.ready)).slice(-10);
    if(!visible.length){host.textContent="Abholung am Tresen";return}
    for(const o of visible){
      const row=document.createElement("p");row.style.margin="8px 0";
      row.textContent=o.ready?"✓ "+o.number+" · Bitte am Tresen abholen":"Bestellung "+o.number;
      host.appendChild(row);
    }
    if(visible.some(o=>o.ready))host.style.background="#dcfce7";
  }
  window.addEventListener("bringness-guest-order",event=>{
    const d=event.detail;if(!d?.orderId||!d?.requestId)return;
    if(!orders.some(o=>o.orderId===d.orderId))orders.push({...d,number:d.orderId.slice(0,8).toUpperCase(),mode});
    orders=orders.slice(-40);save();poll();
  });
  async function poll(){
    if(busy||document.hidden)return;busy=true;
    try{
      for(const o of orders){
        if(o.notified&&o.closed)continue;
        const r=await fetch("/api/v1/guest/collection?orderId="+encodeURIComponent(o.orderId)+"&requestId="+encodeURIComponent(o.requestId),{cache:"no-store"});
        if(!r.ok)continue;
        const j=await r.json();Object.assign(o,j);
        if(o.mode==="pickup"&&o.ready&&!o.notified){signal();o.notified=true}
      }
      save();render();
    }catch{}finally{busy=false}
  }
  fetch("/api/v1/guest/service-mode?code="+encodeURIComponent(code),{cache:"no-store"}).then(async r=>{if(r.ok){mode=(await r.json()).mode;render()}}).catch(()=>{});
  setInterval(poll,4000);document.addEventListener("visibilitychange",()=>{if(!document.hidden)poll()});poll();
})();
