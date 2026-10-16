const {ipcMain,Menu,dialog}=require('electron');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
exports.install=async({app,BrowserWindow,shell,onlineWindow,deviceKey,showOffline=true})=>{
 const {PGlite}=await import('@electric-sql/pglite');
 const {createOfflineLedger}=await import('./offline-ledger.mjs');
 const {quoteOfflineSale,canonicalJson}=await import('./offline-sale-core.mjs');
 const db=new PGlite(path.join(app.getPath('userData'),'offline-postgres'));
 const ledger=await createOfflineLedger(db,quoteOfflineSale,canonicalJson);
 let offlineWindow;
 const {createOfflineSync}=await import('./offline-sync.mjs');
 const open=()=>{if(offlineWindow&&!offlineWindow.isDestroyed()){offlineWindow.focus();return offlineWindow}offlineWindow=new BrowserWindow({width:1280,height:820,show:showOffline,webPreferences:{preload:path.join(__dirname,'offline-preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});offlineWindow.webContents.setWindowOpenHandler(()=>({action:'deny'}));offlineWindow.webContents.on('will-navigate',e=>e.preventDefault());offlineWindow.loadFile(path.join(__dirname,'offline.html'));return offlineWindow;};
 Menu.setApplicationMenu(Menu.buildFromTemplate([{label:'Kasse',submenu:[{label:'Offline-Kasse / Synchronisierung',click:open},{label:'Online-Kasse',click:()=>onlineWindow()?.show()},{role:'quit'}]}]));
 const trusted=event=>offlineWindow&&!offlineWindow.isDestroyed()&&event.sender===offlineWindow.webContents&&event.senderFrame===offlineWindow.webContents.mainFrame&&event.senderFrame.url===pathToFileURL(path.join(__dirname,'offline.html')).href;
 const notify=()=>{if(offlineWindow&&!offlineWindow.isDestroyed())offlineWindow.webContents.send('offline:updated');};
 const coordinator=createOfflineSync({ledger,notify,connect:async()=>{
  const window=onlineWindow();if(!window||window.isDestroyed())return null;
  let url;try{url=new URL(window.webContents.getURL())}catch{return null}if(url.origin!=='https://bringness.de')return null;
  // The login token stays in memory. Native APIs are never exposed to the remote page.
  const token=await window.webContents.executeJavaScript('localStorage.getItem("bringness-pos-token")');if(!token)return null;
  return async(endpoint,body)=>{const response=await fetch('https://bringness.de/api/v1/offline/'+endpoint,{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify({deviceKey,...body}),signal:AbortSignal.timeout(15000),redirect:'error'});const data=await response.json();if(!response.ok)throw Error(data.error||'Synchronisierung nicht verfügbar');return data;};
 }});
 const sync=()=>coordinator.sync();
 // A restarted desktop process reopens the same durable PGlite directory.
 // Trigger recovery once the authenticated online page has loaded; its token
 // may be written shortly after load, so retry on the regular timer as well.
 let startupRecoveryTimer;
 const recoverOnStartup=()=>{clearTimeout(startupRecoveryTimer);startupRecoveryTimer=setTimeout(sync,2500);};
 for(const [channel,run] of Object.entries({'offline:view':async()=>({...await ledger.view(),sync:coordinator.status()}),'offline:sync':()=>coordinator.sync(true),'offline:sale':async(_,sale)=>{const receipt=await ledger.sale(sale);notify();return receipt;},'offline:online':()=>{onlineWindow()?.show();return true}}))ipcMain.handle(channel,(event,...args)=>{if(!trusted(event))throw Error('Nicht freigegeben');return run(event,...args)});
 // Resume the durable queue promptly when the online POS becomes available again.
 // The coordinator is single-flight, so reconnect signals cannot overlap uploads.
 const onlineContents=onlineWindow()?.webContents;
 const resumeAfterLoad=()=>recoverOnStartup();
 onlineContents?.on('did-finish-load',resumeAfterLoad);
 // Recheck connectivity every 30 seconds, including after long outages.
 // Single-flight synchronization prevents overlapping requests during slow recovery.
 recoverOnStartup();const timer=setInterval(sync,30000);timer.unref();
 const showOfflineOnFailure=(_,code)=>{if(code!==-3)open()};
 onlineContents?.on('did-fail-load',showOfflineOnFailure);
 let closed=false;
 const stopRecovery=()=>{
  clearInterval(timer);
  clearTimeout(startupRecoveryTimer);
  onlineContents?.removeListener('did-finish-load',resumeAfterLoad);
  onlineContents?.removeListener('did-fail-load',showOfflineOnFailure);
 };
 app.on('before-quit',stopRecovery);
 return {ledger,open,close:async()=>{
  if(closed)return;
  closed=true;
  stopRecovery();
  offlineWindow?.destroy();
  await db.close();
 }};
};
