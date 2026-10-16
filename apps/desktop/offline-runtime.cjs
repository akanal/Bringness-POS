const {ipcMain,Menu,dialog}=require('electron');
const path=require('node:path');
const fs=require('node:fs/promises');
const {pathToFileURL}=require('node:url');
exports.install=async({app,BrowserWindow,shell,onlineWindow,deviceKey,showOffline=true})=>{
 if(typeof deviceKey!=='string'||!/^[a-f0-9]{64}$/.test(deviceKey))throw Error('Ungültige Offline-Gerätekennung');
 const {PGlite}=await import('@electric-sql/pglite');
 const {createOfflineLedger}=await import('./offline-ledger.mjs');
 const {quoteOfflineSale}=await import('./offline-sale-core.mjs');
 const db=new PGlite(path.join(app.getPath('userData'),'offline-postgres'));
 const ledger=await createOfflineLedger(db,quoteOfflineSale);
 let offlineWindow;
 const {createOfflineSync}=await import('./offline-sync.mjs');
 const open=()=>{if(closed)throw Error('Offline-Kasse wurde bereits geschlossen');if(offlineWindow&&!offlineWindow.isDestroyed()){offlineWindow.show();offlineWindow.focus();return offlineWindow}offlineWindow=new BrowserWindow({width:1280,height:820,show:showOffline,webPreferences:{preload:path.join(__dirname,'offline-preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});offlineWindow.webContents.setWindowOpenHandler(()=>({action:'deny'}));offlineWindow.webContents.on('will-navigate',e=>e.preventDefault());offlineWindow.loadFile(path.join(__dirname,'offline.html'));return offlineWindow;};
 Menu.setApplicationMenu(Menu.buildFromTemplate([{label:'Kasse',submenu:[{label:'Offline-Kasse / Synchronisierung',click:open},{label:'Online-Kasse',click:()=>onlineWindow()?.show()},{role:'quit'}]}]));
 const trusted=event=>!closed&&offlineWindow&&!offlineWindow.isDestroyed()&&event.sender===offlineWindow.webContents&&event.senderFrame===offlineWindow.webContents.mainFrame&&event.senderFrame.url===pathToFileURL(path.join(__dirname,'offline.html')).href;
 const notify=()=>{if(!closed&&offlineWindow&&!offlineWindow.isDestroyed())offlineWindow.webContents.send('offline:updated');};
 const deviceBoundLedger={...ledger,catalog:async snapshot=>{
  if(snapshot?.deviceKey!==deviceKey)throw Error('Offline-Katalog gehört nicht zu diesem Gerät.');
  return ledger.catalog(snapshot);
 }};
 const coordinator=createOfflineSync({ledger:deviceBoundLedger,notify,connect:async()=>{
  const window=onlineWindow();if(!window||window.isDestroyed())return null;
  let url;try{url=new URL(window.webContents.getURL())}catch{return null}if(url.origin!=='https://bringness.de')return null;
  // The login token stays in memory. Native APIs are never exposed to the remote page.
  // Login may not have completed after page load, or navigation may be in progress.
  // Treat either case as temporarily unauthenticated; the recovery timer retries.
  let token;
  try{token=await window.webContents.executeJavaScript('localStorage.getItem("bringness-pos-token")');}
  catch{return null;}
  if(typeof token!=='string'||!token.trim())return null;
  return async(endpoint,body)=>{const response=await fetch('https://bringness.de/api/v1/offline/'+endpoint,{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify({deviceKey,...body}),signal:AbortSignal.timeout(15000),redirect:'error'});const data=await response.json();if(!response.ok)throw Error(typeof data?.error==='string'?data.error:'Synchronisierung nicht verfügbar');return data;};
 }});
 let closed=false;
 let activeSync=null;
 const activeOperations=new Set();
 const track=promise=>{
  const operation=Promise.resolve(promise);
  activeOperations.add(operation);
  operation.finally(()=>activeOperations.delete(operation)).catch(()=>{});
  return operation;
 };
 const sync=(force=false)=>{
  if(closed)return Promise.resolve(coordinator.status());
  const task=coordinator.sync(force);
  activeSync=task;
  task.finally(()=>{if(activeSync===task)activeSync=null;}).catch(()=>{});
  return task;
 };
 const {powerMonitor}=require('electron');
 const resumeAfterSuspend=()=>{if(!closed)sync().catch(()=>{});};
 powerMonitor.on('resume',resumeAfterSuspend);
 // A restarted desktop process reopens the same durable PGlite directory.
 // Trigger recovery once the authenticated online page has loaded; its token
 // may be written shortly after load, so retry on the regular timer as well.
 let startupRecoveryTimer;
 const recoverOnStartup=()=>{if(closed)return;clearTimeout(startupRecoveryTimer);startupRecoveryTimer=setTimeout(()=>{if(!closed)sync().catch(()=>{});},2500);};
 for(const [channel,run] of Object.entries({'offline:view':async()=>({...await ledger.view(),sync:coordinator.status()}),'offline:sync':()=>sync(true),'offline:export':async()=>{
  const report=await ledger.reconciliation({limit:500});
  const selected=await dialog.showSaveDialog(offlineWindow,{title:'Offline-Verkäufe exportieren',defaultPath:'bringness-offline-abgleich-'+new Date().toISOString().slice(0,10)+'.json',filters:[{name:'JSON',extensions:['json']}]});
  if(selected.canceled||!selected.filePath)return {saved:false};
  const destination=selected.filePath;
  const temporary=destination+'.'+require('node:crypto').randomUUID()+'.tmp';
  try{
   await fs.writeFile(temporary,JSON.stringify(report,null,2),{encoding:'utf8',flag:'wx',mode:0o600});
   await fs.link(temporary,destination);
  }catch(error){
   if(error.code==='EEXIST')throw Error('Exportdatei bereits vorhanden. Anderen Dateinamen wählen.');
   throw error;
  }finally{await fs.unlink(temporary).catch(()=>{});}
  return {saved:true,count:report.sales.length};
 },'offline:sale':async(_,sale)=>{const receipt=await ledger.sale(sale);notify();return receipt;},'offline:online':()=>{const window=onlineWindow();if(!window||window.isDestroyed())throw Error('Online-Kasse ist nicht verfügbar');window.show();window.focus();return true}}))ipcMain.handle(channel,(event,...args)=>{if(!trusted(event))throw Error('Nicht freigegeben');return track(run(event,...args))});
 // Resume the durable queue promptly when the online POS becomes available again.
 // The coordinator is single-flight, so reconnect signals cannot overlap uploads.
 const onlineContents=onlineWindow()?.webContents;
 const resumeAfterLoad=()=>recoverOnStartup();
 onlineContents?.on('did-finish-load',resumeAfterLoad);
 // Recheck connectivity every 30 seconds, including after long outages.
 // Single-flight synchronization prevents overlapping requests during slow recovery.
 recoverOnStartup();const timer=setInterval(sync,30000);timer.unref();
 const showOfflineOnFailure=(_,code)=>{if(!closed&&code!==-3)open()};
 // Electron can resume after sleep without a new page-load event. Promptly
 // retry the durable queue when the application becomes active again.
 const resumeOnFocus=()=>{if(!closed)recoverOnStartup();};
 app.on('browser-window-focus',resumeOnFocus);
 onlineContents?.on('did-fail-load',showOfflineOnFailure);
 const stopRecovery=()=>{
  app.removeListener('before-quit',stopRecovery);
  clearInterval(timer);
  clearTimeout(startupRecoveryTimer);
  onlineContents?.removeListener('did-finish-load',resumeAfterLoad);
  onlineContents?.removeListener('did-fail-load',showOfflineOnFailure);
  app.removeListener('browser-window-focus',resumeOnFocus);
  powerMonitor.removeListener('resume',resumeAfterSuspend);
 };
 app.on('before-quit',stopRecovery);
 let closing=null;
 const close=()=>{
  if(closing)return closing;
  closed=true;
  closing=(async()=>{
  stopRecovery();
  offlineWindow?.destroy();
  for(const channel of ['offline:view','offline:sync','offline:export','offline:sale','offline:online'])ipcMain.removeHandler(channel);
  await Promise.allSettled([...activeOperations,...(activeSync?[activeSync]:[])]);
  await db.close();
  })();
  return closing;
 };
 return {ledger,open,close};
};
