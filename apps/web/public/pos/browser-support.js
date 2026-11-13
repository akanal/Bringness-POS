(()=>{
 // Share only the verified current POS tab. Browser and OS dialogs remain local.
 if(new URLSearchParams(location.search).get('desktop')==='1'||new URLSearchParams(location.search).get('edition')==='download')return;
 const media=navigator.mediaDevices;
 if(!media?.getDisplayMedia||!media?.setCaptureHandleConfig||!window.MediaStreamTrack||!('getCaptureHandle' in MediaStreamTrack.prototype))return;
 const handle=crypto.randomUUID();try{media.setCaptureHandleConfig({handle,exposeOrigin:true,permittedOrigins:[location.origin]})}catch{return}
 let reg=null,session=null,stream=null,video=null,frame=null,busy=false,identity='',epoch=0,overlay=null,control=false,accepted=false,accepting=false;
 async function api(path,b){const r=await fetch('/api/v1/remote-support/device/'+path,{method:'POST',signal:AbortSignal.timeout(12000),headers:{authorization:'Bearer '+localStorage.getItem('bringness-pos-token'),'content-type':'application/json'},body:JSON.stringify({deviceKey:reg?.deviceKey,...b})});const d=await r.json();if(!r.ok)throw Error(d.error||'Fernhilfe unterbrochen.');return d}
 function cleanup(){++epoch;const tracks=stream?.getTracks()||[];stream=null;for(const t of tracks)t.stop();video?.remove();video=null;frame=null;control=false;accepted=false;accepting=false;overlay?.remove();overlay=null;session=null}
 async function stop(){const id=accepted?session?.id:null;cleanup();if(id&&reg)try{await api('sessions/'+id+'/stop',{})}catch{}}
 function verified(){const track=stream?.getVideoTracks()[0],h=track?.getCaptureHandle?.();return track?.readyState==='live'&&h?.handle===handle&&h.origin===location.origin}
 function panel(message){overlay?.remove();overlay=document.createElement('aside');overlay.id='browserSupportNotice';overlay.setAttribute('role','alert');overlay.className='browser-support-notice';const p=document.createElement('p');p.textContent=message;overlay.append(p);document.body.append(overlay);return overlay}
 function button(parent,label,run){const b=document.createElement('button');b.type='button';b.textContent=label;b.onclick=run;parent.append(b);return b}
 async function accept(allowControl){if(accepting||accepted)return;accepting=true;const id=session?.id,generation=epoch;try{
   // Called directly by the customer's click; the browser chooser is mandatory.
   const captured=await media.getDisplayMedia({video:{displaySurface:'browser'},audio:false,preferCurrentTab:true,selfBrowserSurface:'include',surfaceSwitching:'exclude',monitorTypeSurfaces:'exclude'});
   if(generation!==epoch||id!==session?.id){captured.getTracks().forEach(t=>t.stop());return}stream=captured;
   if(!verified())throw Error('Bitte ausschließlich diesen Bringness-Kassen-Tab freigeben.');
   const track=stream.getVideoTracks()[0];track.addEventListener('ended',stop);track.addEventListener('capturehandlechange',()=>{if(!verified())stop()});
   video=document.createElement('video');video.muted=true;video.srcObject=stream;await video.play();
   if(generation!==epoch||!verified())throw Error('Bildschirmfreigabe beendet.');
   await api('sessions/'+id+'/accept',{allowed:true,controlAllowed:allowControl});accepted=true;control=allowControl;
   const p=panel('Fernhilfe aktiv: '+(control?'Bildschirm und Bedienung':'nur Bildschirm')+'. Du kannst jederzeit stoppen.');button(p,'Fernhilfe sofort stoppen',stop);
  }catch(e){await stop();const p=panel(e.message||'Bildschirmfreigabe nicht möglich.');button(p,'Schließen',()=>p.remove())}
 }
 function forbidden(el){return !el||Boolean(el.closest('#browserSupportNotice,input[type="password"],input[autocomplete="current-password"],input[autocomplete="new-password"],input[autocomplete^="cc-"],input[autocomplete="one-time-code"],iframe'))}
 function execute(input){
  if(!verified()||!control||!frame||frame.sequence!==input.frameSequence||Date.now()-frame.time>10000||frame.viewportWidth!==innerWidth||frame.viewportHeight!==innerHeight)throw Error('Veralteter Bildschirm.');
  if(input.type==='reload')throw Error('Neuladen bitte lokal an der Kasse bestätigen.'); // End access rather than resuming automatically.
  if(input.type==='click'){const el=document.elementFromPoint(input.x/frame.width*innerWidth,input.y/frame.height*innerHeight);if(forbidden(el))throw Error('Geschütztes Element.');const a=el.closest('a');if(a){const url=new URL(a.href,location.href);if(url.origin!==location.origin||!url.pathname.startsWith('/pos/'))throw Error('Navigation nicht freigegeben.')}el.focus?.();el.click();return}
  const el=document.activeElement;if(forbidden(el))throw Error('Geschützte Eingabe.');
  if(input.type==='scroll'){let scrollable=el;while(scrollable&&!(scrollable.scrollHeight>scrollable.clientHeight&&/auto|scroll/.test(getComputedStyle(scrollable).overflowY)))scrollable=scrollable.parentElement;(scrollable||document.scrollingElement).scrollBy(0,input.delta);return}
  if(input.type==='text'){
   if(!el.matches('input:not([type="file"]):not([type="hidden"]),textarea')||el.disabled||el.readOnly)throw Error('Kein Texteingabefeld.');
   const prototype=el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(prototype,'value').set.call(el,input.text);el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));return;
  }
  // Browser-reserved keys and trusted OS input cannot be synthesized safely.
  if(input.type==='key'&&input.key==='Enter'&&el.form){el.form.requestSubmit();return}
  throw Error('Diese Taste bitte lokal an der Kasse bedienen.');
 }
 async function tick(){if(busy||document.hidden)return;busy=true;try{
  const token=localStorage.getItem('bringness-pos-token'),rid=document.getElementById('restaurant')?.value,next=token+'|'+rid;
  if(next!==identity){await stop();identity=next;reg=null}if(!token||!document.getElementById('workspace')?.classList.contains('show'))return;
  reg=await window.onlineRegisterIdentity?.();if(!reg)return;
  const result=await api('poll',{diagnostics:{supportProtocol:1,appVersion:'web-20261113',platform:'browser',online:navigator.onLine}}),s=result.session;
  if(!s){if(session)cleanup();return}
  if(s.state==='active'&&!stream){cleanup();return}
  if(session?.id!==s.id){cleanup();session=s;const p=panel('Bringness fragt Bildschirmhilfe an. Wähle im Browser ausschließlich diesen Kassen-Tab. Die Freigabe endet spätestens nach 15 Minuten.');button(p,'Nur Bildschirm freigeben',()=>accept(false));button(p,'Bildschirm und Bedienung freigeben',()=>accept(true));button(p,'Ablehnen',async()=>{try{await api('sessions/'+s.id+'/accept',{allowed:false,controlAllowed:false})}finally{cleanup()}})}
  if(s.state!=='active'||!stream)return;
  if(!verified()||Date.parse(s.expires_at)<=Date.now()){await stop();return}
  for(const cmd of result.commands){let state='completed';try{execute(cmd.input)}catch{state='failed'}await api('sessions/'+s.id+'/ack',{inputId:cmd.id,state})}
  if(!stream||!video?.videoWidth)return;
  const canvas=document.createElement('canvas'),scale=Math.min(1,1600/video.videoWidth,900/video.videoHeight);canvas.width=Math.floor(video.videoWidth*scale);canvas.height=Math.floor(video.videoHeight*scale);canvas.getContext('2d').drawImage(video,0,0,canvas.width,canvas.height);
  let data=canvas.toDataURL('image/jpeg',0.6).split(',')[1];if(data.length>220000)data=canvas.toDataURL('image/jpeg',0.25).split(',')[1];if(data.length>220000)throw Error('Bildschirm zu groß.');
  const viewportWidth=innerWidth,viewportHeight=innerHeight,d=await api('sessions/'+s.id+'/frame',{frame:data,width:canvas.width,height:canvas.height});frame={sequence:d.frameSequence,time:Date.now(),width:canvas.width,height:canvas.height,viewportWidth,viewportHeight};
 }catch{if(session)await stop()}finally{busy=false}}
 for(const name of ['pointerdown','keydown','input'])document.addEventListener(name,event=>{if(event.isTrusted)frame=null},true);
 document.addEventListener('visibilitychange',()=>{if(document.hidden)stop()});window.addEventListener('pagehide',()=>{if(accepted&&session&&reg)fetch('/api/v1/remote-support/device/sessions/'+session.id+'/stop',{method:'POST',keepalive:true,headers:{authorization:'Bearer '+localStorage.getItem('bringness-pos-token'),'content-type':'application/json'},body:JSON.stringify({deviceKey:reg.deviceKey})}).catch(()=>{});cleanup()});window.addEventListener('storage',e=>{if(e.key===null||e.key==='bringness-pos-token')stop()});setInterval(tick,2000);
})();
