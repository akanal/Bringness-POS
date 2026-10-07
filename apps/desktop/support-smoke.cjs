const {app,BrowserWindow,session,dialog,nativeImage}=require('electron');const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const data=fs.mkdtempSync(path.join(os.tmpdir(),'bringness-support-smoke-'));app.setPath('userData',data);
let online,runtime,consented=false,ended=false,frame=null,commands=[],acks=[];
const sid='11111111-1111-4111-8111-111111111111';
const wait=async predicate=>{for(let i=0;i<100;i++){if(await predicate())return;await new Promise(r=>setTimeout(r,50))}throw Error('Native support timeout')};
app.whenReady().then(async()=>{try{
 session.defaultSession.protocol.handle('https',async request=>{
  const url=new URL(request.url);
  if(url.pathname==='/pos/')return new Response('<!doctype html><html><body><button id="target" style="position:absolute;left:20px;top:20px;width:200px;height:60px" onclick="this.textContent=\'Clicked\'">Test button</button><input id="input" style="position:absolute;left:20px;top:110px"><script>localStorage.setItem("bringness-pos-token","test-native-token")</script></body></html>',{headers:{'content-type':'text/html'}});
  const body=JSON.parse(await request.text());assert.equal(request.headers.get('authorization'),'Bearer test-native-token');assert.equal(body.deviceKey,'a'.repeat(64));let result={};
  if(url.pathname.endsWith('/device/poll')){result={session:ended?null:{id:sid,state:consented?'active':'requested',control_allowed:consented,expires_at:new Date(Date.now()+60000).toISOString()},commands};commands=[]}
  else if(url.pathname.endsWith('/accept')){assert.equal(body.allowed,true);assert.equal(body.controlAllowed,true);consented=true}
  else if(url.pathname.endsWith('/frame')){assert(consented&&!ended);const image=nativeImage.createFromBuffer(Buffer.from(body.frame,'base64'));assert.equal(image.getSize().width,body.width);assert.equal(image.getSize().height,body.height);frame=body;result={frameSequence:1}}
  else if(url.pathname.endsWith('/ack'))acks.push(body);
  else if(url.pathname.endsWith('/stop'))ended=true;
  else throw Error('Unexpected route '+url.pathname);
  return new Response(JSON.stringify(result),{headers:{'content-type':'application/json'}});
 });
 online=new BrowserWindow({width:800,height:600,webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true}});await online.loadURL('https://bringness.de/pos/');
 const originalDialog=dialog.showMessageBox;dialog.showMessageBox=async(_win,options)=>{assert.equal(options.defaultId,0);return {response:2}};
 runtime=require('./remote-support.cjs').installRemoteSupport({app,BrowserWindow,onlineWindow:()=>online,deviceKey:'a'.repeat(64)});
 await runtime.tick();await wait(()=>consented);await runtime.tick();await wait(()=>frame);
 const bounds=online.getContentBounds();commands=[{id:'click',created_at:new Date().toISOString(),input:{type:'click',frameSequence:1,x:Math.floor(80/bounds.width*frame.width),y:Math.floor(45/bounds.height*frame.height)}}];await runtime.tick();await wait(()=>online.webContents.executeJavaScript('document.getElementById("target").textContent==="Clicked"'));assert.equal(acks.at(-1).state,'completed');
 await online.webContents.executeJavaScript('document.getElementById("input").focus()');commands=[{id:'text',created_at:new Date().toISOString(),input:{type:'text',frameSequence:1,text:'Bringness test'}}];await runtime.tick();assert.equal(await online.webContents.executeJavaScript('document.getElementById("input").value'),'Bringness test');
 commands=[{id:'invalid',created_at:new Date().toISOString(),input:{type:'key',frameSequence:1,key:'Meta'}}];await runtime.tick();assert.equal(acks.at(-1).state,'failed');
 const control=BrowserWindow.getAllWindows().find(w=>w!==online);assert(control);await wait(()=>control.webContents.executeJavaScript('!!document.getElementById("stop")'));await control.webContents.executeJavaScript('document.getElementById("stop").click()');await wait(()=>ended);assert.equal(BrowserWindow.getAllWindows().length,1);
 dialog.showMessageBox=originalDialog;console.log('Native remote support passed: customer consent, real JPEG capture, scaled mouse click, text input, OS-key rejection and native stop control.');app.exit(0);
 }catch(error){console.error(error);await runtime?.stop();app.exit(1)}});
