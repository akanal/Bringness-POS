(()=>{
  let current=null,config=null,registration=null,subscription=null,installPrompt=null,generation=0;
  const apple=()=>/iPhone|iPad|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
  const standalone=()=>navigator.standalone===true||window.matchMedia?.('(display-mode: standalone)').matches;
  const api=async(action,data={})=>{const r=await fetch('/api/v1/guest/collection-push',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...current,action,...data})});const j=await r.json();if(!r.ok)throw Error(j.error||'Aktivierung fehlgeschlagen');return j};
  function controls(){
    let host=document.getElementById('guestPushControls');if(host)return host;
    host=document.createElement('section');host.id='guestPushControls';host.className='panel';
    const title=document.createElement('h2');title.textContent='Abholung bei gesperrtem Bildschirm';
    const text=document.createElement('p');text.textContent='Möchtest du eine Nachricht erhalten, sobald diese Bestellung abholbereit ist? Freiwillig, nur für diese Bestellung. Die Zuordnung wird spätestens nach 24 Stunden gelöscht.';
    const button=document.createElement('button');button.id='guestPushEnable';button.className='primary';button.textContent='Abholmitteilungen erlauben';
    const disable=document.createElement('button');disable.id='guestPushDisable';disable.textContent='Mitteilungen für diese Bestellung ausschalten';disable.hidden=true;
    const install=document.createElement('button');install.id='guestPushInstall';install.textContent='Abhol-App hinzufügen';install.hidden=standalone();
    const status=document.createElement('p');status.id='guestPushStatus';status.setAttribute('role','status');
    host.append(title,text,button,disable,install,status);(document.getElementById('status')?.parentElement||document.body).appendChild(host);
    install.onclick=async()=>{if(installPrompt){await installPrompt.prompt();installPrompt=null}else status.textContent=apple()?'Safari → Teilen → Zum Home-Bildschirm. Danach über das App-Symbol öffnen und hier Abholmitteilungen erlauben.':'Im Browser-Menü „App installieren“ oder „Zum Startbildschirm hinzufügen“ wählen. Mitteilungen sind auf Android auch ohne Installation möglich.'};
    button.onclick=async()=>{
      if(apple()&&!standalone()){status.textContent='Auf dem iPhone zuerst: Safari → Teilen → Zum Home-Bildschirm. Danach über das App-Symbol öffnen und Abholmitteilungen erlauben.';return}
      if(!('Notification'in window)||!('PushManager'in window)||!('serviceWorker'in navigator)){status.textContent='Dieser Browser unterstützt keine Hintergrundmeldungen. Die Abholmeldung erscheint weiterhin auf der geöffneten Bestellseite.';return}
      button.disabled=true;
      try{
        const permission=Notification.permission==='default'?await Notification.requestPermission():Notification.permission;
        if(permission!=='granted')throw Error('Mitteilungen nicht erlaubt. Du kannst sie in den Browser-Einstellungen freigeben oder diese Seite geöffnet lassen.');
        await navigator.serviceWorker.register('/tisch/sw.js',{scope:'/tisch/'});registration=await navigator.serviceWorker.ready;
        const encoded=config.publicKey.replace(/-/g,'+').replace(/_/g,'/'),raw=atob(encoded+'='.repeat((4-encoded.length%4)%4)),key=Uint8Array.from(raw,c=>c.charCodeAt(0));
        subscription=await registration.pushManager.getSubscription();
        if(subscription?.options?.applicationServerKey){const old=new Uint8Array(subscription.options.applicationServerKey);if(old.length!==key.length||old.some((v,i)=>v!==key[i])){await subscription.unsubscribe();subscription=null}}
        subscription ||= await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key});
        await api('subscribe',{subscription:subscription.toJSON(),consent:true});
        button.hidden=true;disable.hidden=false;status.textContent='Abholmitteilungen aktiviert – auch bei gesperrtem Bildschirm. Ton und Anzeige richten sich nach deinen Handy-Einstellungen.';
      }catch(error){status.textContent=error.message}finally{button.disabled=false}
    };
    disable.onclick=async()=>{disable.disabled=true;try{await api('disable',{subscription:subscription.toJSON()});disable.hidden=true;button.hidden=false;status.textContent='Mitteilungen für diese Bestellung ausgeschaltet.'}catch(e){status.textContent=e.message}finally{disable.disabled=false}};
    return host;
  }
  async function prepare(order){
    if(!order?.orderId||!order?.requestId)return;
    const currentGeneration=++generation;current={orderId:order.orderId,requestId:order.requestId};
    const query=new URLSearchParams(current).toString();
    try{
      const response=await fetch('/api/v1/guest/collection-push?'+query,{cache:'no-store'});if(!response.ok)return;
      const result=await response.json();if(currentGeneration!==generation)return;config=result;
      let manifest=document.getElementById('guestPickupManifest');if(!manifest){manifest=document.createElement('link');manifest.id='guestPickupManifest';manifest.rel='manifest';document.head.appendChild(manifest)}manifest.href='/api/v1/guest/collection-manifest?'+query;
      const host=controls(),button=host.querySelector('#guestPushEnable'),status=host.querySelector('#guestPushStatus');button.disabled=!config.publicKey;if(!config.publicKey)status.textContent='Hintergrundmeldungen sind derzeit nicht verfügbar. Bitte die Bestellseite geöffnet lassen.';
      if(apple()&&!standalone())status.textContent='iPhone: Abhol-App zum Home-Bildschirm hinzufügen, über das Symbol öffnen und dann Mitteilungen erlauben.';
      if('serviceWorker'in navigator&&'Notification'in window&&Notification.permission==='granted'){
        registration=await navigator.serviceWorker.getRegistration('/tisch/');subscription=await registration?.pushManager.getSubscription();
        if(subscription){const state=await api('status',{subscription:subscription.toJSON()});if(state.subscribed){button.hidden=true;host.querySelector('#guestPushDisable').hidden=false;status.textContent='Abholmitteilungen für diese Bestellung sind aktiviert.'}}
      }
    }catch{}
  }
  window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event});
  window.addEventListener('bringness-guest-order',event=>prepare(event.detail));
  const params=new URLSearchParams(location.search);prepare({orderId:params.get('orderId'),requestId:params.get('requestId')});
})();
