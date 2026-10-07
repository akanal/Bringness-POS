const {ipcMain,dialog,nativeImage}=require('electron');const path=require('node:path');
function installRemoteSupport({app,BrowserWindow,onlineWindow,deviceKey,licenseBlocked=()=>false}){
 let current=null,indicator=null,busy=false,sequence=0,frameSize=null,stopped=new Set();
 const origin='https://bringness.de';
 async function request(pathname,body){
  const win=onlineWindow();if(!win||win.isDestroyed()||new URL(win.webContents.getURL()).origin!==origin)throw Error('Kasse nicht online');
  const code=`(async()=>{const token=localStorage.getItem('bringness-pos-token');if(!token)throw Error('Anmeldung fehlt');const response=await fetch(${JSON.stringify('/api/v1/remote-support/'+pathname)},{method:'POST',signal:AbortSignal.timeout(12000),headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify(${JSON.stringify({...body,deviceKey})})});const result=await response.json();if(!response.ok)throw Error(result.error||'Fernhilfe nicht verfügbar');return result})()`;
  return win.webContents.executeJavaScript(code,true);
 }
 function closeLocal(){current=null;frameSize=null;sequence=0;if(indicator&&!indicator.isDestroyed()){const old=indicator;indicator=null;old.destroy()}}
 async function stop(){const id=current?.id;closeLocal();if(id){stopped.add(id);try{await request('device/sessions/'+id+'/stop',{})}catch{}}}
 ipcMain.on('bringness-support-stop',event=>{if(indicator&&event.sender===indicator.webContents)stop()});
 function showIndicator(controlAllowed){
  indicator=new BrowserWindow({width:440,height:170,resizable:false,minimizable:false,maximizable:false,alwaysOnTop:true,autoHideMenuBar:true,title:'Bringness Fernhilfe aktiv',webPreferences:{preload:path.join(__dirname,'support-preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
  indicator.webContents.setWindowOpenHandler(()=>({action:'deny'}));indicator.webContents.on('will-navigate',event=>event.preventDefault());
  indicator.on('closed',()=>{indicator=null;if(current)stop()});
  indicator.loadFile(path.join(__dirname,'support-control.html'),{query:{mode:controlAllowed?'control':'view'}});
 }
 async function execute(command){
  const win=onlineWindow(),input=command.input;
  if(!current?.control_allowed||!frameSize||input.frameSequence!==sequence||!win||win.isDestroyed()||new URL(win.webContents.getURL()).origin!==origin||licenseBlocked())throw Error('Bedienung nicht erlaubt');
  // No operating system keys, arbitrary scripts or filesystem access are accepted.
  win.focus();
  const bounds=win.getContentBounds();
  if(input.type==='click'){
   if(!Number.isInteger(input.x)||!Number.isInteger(input.y)||input.x<0||input.y<0||input.x>=frameSize.width||input.y>=frameSize.height)throw Error('Ungültige Position');
   const x=Math.floor(input.x/frameSize.width*bounds.width),y=Math.floor(input.y/frameSize.height*bounds.height);
   win.webContents.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,x,y});win.webContents.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,x,y});
  }else if(input.type==='text'){
   if(typeof input.text!=='string'||input.text.length>100||/[\x00-\x1f\x7f]/.test(input.text))throw Error('Ungültiger Text');await win.webContents.insertText(input.text);
  }else if(input.type==='key'){
   const keys={Enter:'Enter',Tab:'Tab',Backspace:'Backspace',Escape:'Escape',ArrowUp:'Up',ArrowDown:'Down',ArrowLeft:'Left',ArrowRight:'Right'};if(!keys[input.key])throw Error('Taste nicht erlaubt');win.webContents.sendInputEvent({type:'keyDown',keyCode:keys[input.key]});win.webContents.sendInputEvent({type:'keyUp',keyCode:keys[input.key]});
  }else if(input.type==='scroll'){
   if(!Number.isInteger(input.delta)||Math.abs(input.delta)>500)throw Error('Scrollen nicht erlaubt');win.webContents.sendInputEvent({type:'mouseWheel',x:Math.floor(bounds.width/2),y:Math.floor(bounds.height/2),deltaY:input.delta,canScroll:true});
  }else if(input.type==='reload'){win.webContents.reloadIgnoringCache()}else throw Error('Aktion nicht erlaubt');
 }
 async function tick(){
  if(busy)return;busy=true;
  try{
   const result=await request('device/poll',{diagnostics:{appVersion:app.getVersion(),platform:process.platform,supportProtocol:1,online:true,licenseBlocked:licenseBlocked()}});
   const session=result.session;
   if(licenseBlocked()){if(current)await stop();return}
   if(!session||stopped.has(session.id)){if(current)closeLocal();return}
   if(session.state==='requested'){
    if(current)return;
    const choice=await dialog.showMessageBox(onlineWindow(),{type:'question',buttons:['Ablehnen','Nur Bildschirm zeigen','Bildschirm und Bedienung erlauben'],defaultId:0,cancelId:0,title:'Bringness Fernhilfe',message:'Bringness möchte diese Kasse prüfen.',detail:'Nur das Bringness-Kassenfenster wird übertragen. Die Sitzung läuft höchstens 15 Minuten. Bei erlaubter Bedienung kann Bringness Klicks und Tastatureingaben in der Kasse ausführen. Über „Fernhilfe beenden“ können Sie jederzeit stoppen.'});
    await request('device/sessions/'+session.id+'/accept',{allowed:choice.response!==0,controlAllowed:choice.response===2});
    if(choice.response===0){stopped.add(session.id);return}
    current={...session,control_allowed:choice.response===2};showIndicator(choice.response===2);return;
   }
   if(!current||current.id!==session.id){return} // Never resume an old consent after a process restart.
   current=session;
   if(Date.now()>=Date.parse(session.expires_at)){await stop();return}
   for(const command of result.commands||[]){
    let state='completed';try{if(!current||stopped.has(session.id)||Date.now()-Date.parse(command.created_at)>15000)throw Error('Sitzung beendet oder Aktion abgelaufen');await execute(command)}catch{state='failed'}
    await request('device/sessions/'+session.id+'/ack',{inputId:command.id,state});
   }
   if(!current)return;
   const win=onlineWindow();if(!win||win.isDestroyed()||win.isMinimized()){await stop();return}
   const image=nativeImage.createFromBuffer((await win.webContents.capturePage()).toJPEG(75));const size=image.getSize(),factor=Math.min(1,1280/size.width,720/size.height);
   const resized=image.resize({width:Math.max(1,Math.floor(size.width*factor)),height:Math.max(1,Math.floor(size.height*factor))});const dims=resized.getSize();
   let jpeg=resized.toJPEG(55);if(jpeg.length>160000)jpeg=resized.toJPEG(30);if(jpeg.length>160000)throw Error('Bild zu groß');
   if(!current||current.id!==session.id||stopped.has(session.id))return;
   const response=await request('device/sessions/'+session.id+'/frame',{frame:jpeg.toString('base64'),width:dims.width,height:dims.height});sequence=response.frameSequence;frameSize=dims;
  }catch{if(current)await stop()}finally{busy=false}
 }
 const timer=setInterval(tick,2000);timer.unref?.();app.on('before-quit',()=>{clearInterval(timer);stop()});
 return {stop,tick};
}
module.exports={installRemoteSupport};
