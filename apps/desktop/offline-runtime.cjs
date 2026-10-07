const {ipcMain,Menu,dialog}=require('electron');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
exports.install=async({app,BrowserWindow,shell,onlineWindow,deviceKey})=>{
 const {PGlite}=await import('@electric-sql/pglite');
 const {createOfflineLedger}=await import('./offline-ledger.mjs');
 const {quoteOfflineSale,canonicalJson}=await import('./offline-sale-core.mjs');
 const db=new PGlite(path.join(app.getPath('userData'),'offline-postgres'));
 const ledger=await createOfflineLedger(db,quoteOfflineSale,canonicalJson);
 let offlineWindow,busy=false,lastCatalog=0;
 const open=()=>{if(offlineWindow&&!offlineWindow.isDestroyed()){offlineWindow.focus();return}offlineWindow=new BrowserWindow({width:1280,height:820,webPreferences:{preload:path.join(__dirname,'offline-preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});offlineWindow.webContents.setWindowOpenHandler(()=>({action:'deny'}));offlineWindow.webContents.on('will-navigate',e=>e.preventDefault());offlineWindow.loadFile(path.join(__dirname,'offline.html'));};
 Menu.setApplicationMenu(Menu.buildFromTemplate([{label:'Kasse',submenu:[{label:'Offline-Kasse / Synchronisierung',click:open},{label:'Online-Kasse',click:()=>onlineWindow()?.show()},{role:'quit'}]}]));
 const trusted=event=>offlineWindow&&!offlineWindow.isDestroyed()&&event.sender===offlineWindow.webContents&&event.senderFrame===offlineWindow.webContents.mainFrame&&event.senderFrame.url===pathToFileURL(path.join(__dirname,'offline.html')).href;
 for(const [channel,run] of Object.entries({'offline:view':()=>ledger.view(),'offline:sale':(_,sale)=>ledger.sale(sale),'offline:online':()=>{onlineWindow()?.show();return true}}))ipcMain.handle(channel,(event,...args)=>{if(!trusted(event))throw Error('Nicht freigegeben');return run(event,...args)});
 const sync=async()=>{
  if(busy)return;const window=onlineWindow();if(!window||window.isDestroyed())return;
  let url;try{url=new URL(window.webContents.getURL())}catch{return}if(url.origin!=='https://bringness.de')return;
  busy=true;try{
   // The login token stays in memory. Native APIs are never exposed to the remote page.
   const token=await window.webContents.executeJavaScript('localStorage.getItem("bringness-pos-token")');if(!token)return;
   const request=async(endpoint,body)=>{const response=await fetch('https://bringness.de/api/v1/offline/'+endpoint,{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify({deviceKey,...body}),signal:AbortSignal.timeout(15000),redirect:'error'});const data=await response.json();if(!response.ok)throw Error(data.error||'Synchronisierung nicht verfügbar');return data;};
   // Recover old sales before refreshing the catalog; account changes cannot discard them.
   const pending=await ledger.pending();for(const sale of pending){try{await ledger.acknowledge(sale.id,await request('sales',{sale:sale.request}))}catch(e){await ledger.error(sale.id,e.message);throw e}}
   if(Date.now()-lastCatalog>6*3600000){const {snapshot}=await request('catalog',{});await ledger.catalog(snapshot);lastCatalog=Date.now()}
   if(offlineWindow&&!offlineWindow.isDestroyed())offlineWindow.webContents.send('offline:updated');
  }catch(e){console.error('Offline synchronization:',e.message)}finally{busy=false}
 };
 setTimeout(sync,12000);const timer=setInterval(sync,60000);timer.unref();
 app.on('before-quit',()=>clearInterval(timer));
 onlineWindow()?.webContents.on('did-fail-load',(_,code)=>{if(code!==-3)open()});
};
