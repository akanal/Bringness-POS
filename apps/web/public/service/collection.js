(()=>{
  let busy=false;
  const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  async function refresh(){
    if(busy||document.hidden)return;
    const token=localStorage.getItem("bringness-waiter-token");
    if(!token)return;
    busy=true;
    try{
      const headers={authorization:"Bearer "+token};
      const b=await fetch("/api/v1/waiter/bootstrap",{headers,cache:"no-store"});
      if(!b.ok)return;
      const boot=await b.json(),rid=boot.employee?.restaurant_id;
      if(!rid)return;
      const response=await fetch("/api/v1/qr-service/queue?restaurantId="+encodeURIComponent(rid),{headers,cache:"no-store"});
      if(!response.ok)return;
      const j=await response.json();
      let host=document.getElementById("waiterCollection");
      if(j.mode!=="pickup"){host?.remove();return}
      if(!host){host=document.createElement("section");host.id="waiterCollection";document.getElementById("app")?.prepend(host)}
      host.innerHTML="<h2>Abholung am Tresen</h2>"+(j.orders.filter(o=>!o.qr_ready_at).map((o,i)=>'<article class="card"><b>'+(i+1)+'. · '+esc(o.table_name)+' · #'+esc(o.id.slice(0,8).toUpperCase())+'</b><p>'+o.items.map(x=>esc(x.quantity)+' × '+esc(x.name)+(x.note?' · '+esc(x.note):"")+(x.extras?.length?' · '+x.extras.map(e=>esc(e.name)).join(", "):"")).join("<br>")+'</p><button type="button" data-collection-ready="'+esc(o.id)+'">Abholbereit</button></article>').join("")||"<p>Keine wartenden Bestellungen.</p>");
      host.querySelectorAll("[data-collection-ready]").forEach(btn=>btn.onclick=async()=>{
        btn.disabled=true;
        try{const r=await fetch("/api/v1/orders/"+encodeURIComponent(btn.dataset.collectionReady)+"/collection-ready",{method:"POST",headers});if(!r.ok)throw Error((await r.json()).error);await refresh()}catch(e){const p=document.createElement("p");p.textContent=e.message;host.appendChild(p);btn.disabled=false}
      });
    }catch{}finally{busy=false}
  }
  setInterval(refresh,5000);refresh();
})();
