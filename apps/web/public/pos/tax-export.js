(()=>{
  const $=id=>document.getElementById(id);
  const esc=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
  const euro=c=>(Number(c||0)/100).toLocaleString("de-DE",{style:"currency",currency:"EUR"});
  const token=()=>localStorage.getItem("bringness-pos-token");
  async function api(path){const r=await fetch('/api/v1'+path,{headers:{authorization:'Bearer '+token()}});const j=await r.json();if(!r.ok)throw Error(j.error||'Fehler');return j}
  function download(name,type,text){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type}));a.download=name;document.body.appendChild(a);a.click();URL.revokeObjectURL(a.href);a.remove()}
  function csvCell(v){return '"'+String(v??'').replace(/"/g,'""')+'"'}
  async function load(){
    const rid=$('restaurant')?.value;if(!rid)throw Error('Bitte zuerst einen Betrieb auswählen.');
    const [receipts,fiscal]=await Promise.all([api('/receipts?restaurantId='+encodeURIComponent(rid)),api('/fiscal/status?restaurantId='+encodeURIComponent(rid))]);
    return {rid,receipts:receipts.receipts||[],fiscal};
  }
  async function exportReceipts(){const d=await load();const rows=[['Belegnummer','Datum','Betrag EUR','Zahlungsart','Quelle','Fiskalstatus']];for(const r of d.receipts)rows.push([r.receipt_number,new Date(r.issued_at).toLocaleString('de-DE'),(Number(r.total_cents||0)/100).toFixed(2).replace('.',','),r.payment_method,r.source,r.fiscal_status]);download('Bringness-POS-Belegliste-'+new Date().toISOString().slice(0,10)+'.csv','text/csv;charset=utf-8','\ufeff'+rows.map(x=>x.map(csvCell).join(';')).join('\n'))}
  async function exportFiscal(){const d=await load();download('Bringness-POS-Fiskalstatus-'+new Date().toISOString().slice(0,10)+'.json','application/json;charset=utf-8',JSON.stringify({exportedAt:new Date().toISOString(),restaurantId:d.rid,fiscalStatus:d.fiscal,receiptCount:d.receipts.length},null,2))}
  async function refresh(){const box=$('taxExportStatus');if(!box)return;box.textContent='Wird geladen…';try{const d=await load();const total=d.receipts.reduce((s,r)=>s+Number(r.total_cents||0),0);box.innerHTML='<b>'+d.receipts.length+' Belege · '+esc(euro(total))+'</b><br>Fiskalstatus: '+esc(d.fiscal.status||'unbekannt')+' · TSE-Verbindung: '+esc(d.fiscal.connection||'unbekannt')+'<br><small>'+esc(d.fiscal.message||'')+'</small>'}catch(e){box.textContent=e.message}}
  function mount(){
    if($('taxExportCenter'))return;
    const host=document.querySelector('[data-view="belege"]')?.closest('button')?null:null;
    const pages=[...document.querySelectorAll('.modulepage')];
    let target=pages.find(p=>/Belege|Rechnungen|Exporte/i.test(p.textContent||''))||pages.find(p=>p.id&&/beleg/i.test(p.id));
    if(!target)return setTimeout(mount,500);
    const sec=document.createElement('section');sec.id='taxExportCenter';sec.className='manage';sec.innerHTML='<h3>Steuerberater & Finanzamt – Exportzentrum</h3><p class="muted">Datenexport für Buchhaltung und Prüfungen. Ein offizieller DSFinV-K-/Finanzamt-Direktexport wird erst als verfügbar angezeigt, wenn die TSE-/DSFinV-K-Anbindung vollständig eingerichtet und geprüft ist.</p><div id="taxExportStatus" class="modulecard">Wird geladen…</div><div style="display:flex;gap:9px;flex-wrap:wrap;margin-top:12px"><button type="button" id="taxReceiptCsv">Belegliste als CSV</button><button type="button" id="taxFiscalJson">Fiskalstatus als JSON</button><button type="button" id="taxRefresh">Status aktualisieren</button></div>';
    target.appendChild(sec);
    $('taxReceiptCsv').onclick=()=>exportReceipts().catch(e=>alert(e.message));
    $('taxFiscalJson').onclick=()=>exportFiscal().catch(e=>alert(e.message));
    $('taxRefresh').onclick=()=>refresh();
    $('restaurant')?.addEventListener('change',refresh);
    refresh();
  }
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',mount):mount();
})();
