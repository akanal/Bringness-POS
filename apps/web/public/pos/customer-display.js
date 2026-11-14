(()=>{
 let popup=null,channel='',bound='',sequence=0,ready=false;const settingsKey='bringness.customer-display.enabled.v1:';
 const context=()=>{try{const rid=document.getElementById('restaurant')?.value,user=data.user?.id;return token&&localStorage.getItem('bringness-pos-token')===token&&user&&rid&&document.getElementById('workspace')?.classList.contains('show')?{rid,user,scope:user+':'+rid}:null}catch{return null}};
 const enabled=c=>{try{return !!c&&localStorage.getItem(settingsKey+c.scope)==='yes'}catch{return false}};
 const idle=state=>({business:'',state,items:[],adjustments:[],totalCents:0});
 function retail(c){
  if(document.body.dataset.posView==='handel')return window.bnTradeCustomerDisplay?.(c.rid)||idle('unavailable');
  if(document.body.dataset.posView!=='kasse'||!cart.length)return idle('idle');
  const subtotal=Math.round(cart.reduce((n,x)=>n+x.qty*x.price,0)*100),tools=window.bnRetailSales,extras=tools?.extras()||{},discount=extras.discount?subtotal-window.bnDiscountTotal(subtotal,extras.discount):0;
  const total=tools?tools.total(subtotal):subtotal;if(!Number.isSafeInteger(total))throw Error();
  const adjustments=[...(discount?[{name:'Rabatt',totalCents:-discount}]:[]),...(window.bnDepositBreakdown?.(c.rid,cart.map(x=>({productId:x.id,qty:x.qty})))||[]).map(x=>({name:x.label,totalCents:x.totalCents}))];
  if(window.bnDepositLocked?.(c.rid))throw Error();
  return {business:String(data.restaurants.find(r=>r.id===c.rid)?.name||'Bringness').slice(0,120),state:'cart',items:cart.map(x=>({name:String(x.name).slice(0,500),qty:x.qty,totalCents:Math.round(x.qty*x.price*100)})),adjustments,totalCents:total};
 }
 function send(snapshot){if(popup&&!popup.closed&&ready)popup.postMessage({type:'bringness:customer-display',channel,sequence:++sequence,snapshot},location.origin);}
 function disconnect(){try{send(idle('idle'));popup?.close()}catch{}popup=null;ready=false;channel='';bound='';}
 function update(){const c=context();if(!popup)return;if(popup.closed){disconnect();return;}if(!c||c.scope!==bound||!enabled(c)){disconnect();return;}try{send(retail(c))}catch{send(idle('unavailable'));}}
 window.addEventListener('message',event=>{if(event.origin!==location.origin||event.source!==popup||event.data?.type!=='bringness:customer-display-ready'||event.data.channel!==channel)return;ready=true;update();});
 window.addEventListener('pagehide',disconnect);window.addEventListener('storage',e=>{if(e.key===null||e.key==='bringness-pos-token'||e.key?.startsWith(settingsKey))update();});document.getElementById('restaurant')?.addEventListener('change',update);document.addEventListener('bringness:pos-view',update);setInterval(update,1500);
 window.bnRenderCustomerDisplaySettings=area=>{
  const c=context();if(!c)return;const card=document.createElement('section');card.className='modulecard';card.dataset.settingsGroup='devices';
  const title=document.createElement('h3');title.textContent='Kundendisplay';const label=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.id='customerDisplayEnabled';input.checked=enabled(c);label.append(input,document.createTextNode(' Kundendisplay für diese Kasse aktivieren'));
  const text=document.createElement('p');text.textContent='Artikel, Mengen, Rabatt, Pfand und Gesamtbetrag laufen ohne Bedienung mit. Die Auswahl bleibt für diesen Betrieb und dieses Browserprofil gespeichert. Beim Kassenstart das Anzeigefenster bei Bedarf öffnen und auf den zweiten Monitor ziehen; dort kann es über die Browsersteuerung im Vollbild laufen.';
  const open=document.createElement('button');open.type='button';open.id='customerDisplayOpen';open.textContent='Kundendisplay öffnen';open.disabled=!input.checked;
  const status=document.createElement('p');status.setAttribute('role','status');
  const current=()=>context()?.scope===c.scope&&document.body.dataset.posView==='einstellungen'&&card.isConnected;
  input.onchange=async()=>{const wanted=input.checked;input.disabled=true;try{if(!current()||!await window.ensurePersonnelAccess?.()||!current())throw Error('Verwaltungsfreigabe und aktueller Betrieb erforderlich.');localStorage.setItem(settingsKey+c.scope,wanted?'yes':'no');input.checked=enabled(c);if(input.checked!==wanted)throw Error('Einstellung konnte nicht gespeichert werden.');open.disabled=!wanted;if(!wanted)disconnect();status.textContent=wanted?'Kundendisplay aktiviert. Anzeigefenster bei Bedarf öffnen.':'Kundendisplay ausgeschaltet.';}catch(error){input.checked=enabled(c);open.disabled=!input.checked;status.textContent=error.message}finally{input.disabled=false}};
  open.onclick=()=>{if(!current()||!enabled(c)){status.textContent='Bitte Kundendisplay aktivieren und Einstellungen erneut öffnen.';return;}if(popup&&!popup.closed&&bound===c.scope){popup.focus();return;}disconnect();try{channel=Array.from(crypto.getRandomValues(new Uint8Array(32)),x=>x.toString(16).padStart(2,'0')).join('');bound=c.scope;sequence=0;popup=window.open('/pos/customer-display.html#'+channel,'_blank','popup,width=1000,height=750');if(!popup){disconnect();throw Error('Der Browser hat das Fenster blockiert. Pop-ups für diese Kasse erlauben und erneut öffnen.');}status.textContent='Anzeigefenster geöffnet. Auf den Kundenmonitor ziehen; die Artikel erscheinen beim Verkauf.';}catch(error){status.textContent=error.message}};
  card.append(title,label,text,open,status);area.append(card);
 };
})();
