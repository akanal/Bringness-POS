const {app,BrowserWindow,shell}=require('electron'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'bringness-electron-test-'));app.setPath('userData',directory);
app.whenReady().then(async()=>{let runtime,rogue;try{
 runtime=await require('./offline-runtime.cjs').install({app,BrowserWindow,shell,onlineWindow:()=>null,deviceKey:'a'.repeat(64),showOffline:false});
 const snapshot={id:crypto.randomUUID(),companyId:crypto.randomUUID(),deviceKey:'a'.repeat(64),createdAt:new Date().toISOString(),validUntil:new Date(Date.now()+86400000).toISOString(),restaurants:[{id:crypto.randomUUID(),name:'Testkasse'}],products:[],merchant:{}};snapshot.products=[{id:crypto.randomUUID(),restaurantId:snapshot.restaurants[0].id,name:'Burger',priceCents:895,taxRate:19}];snapshot.merchant[snapshot.restaurants[0].id]={businessName:'Testbetrieb'};await runtime.ledger.catalog(snapshot);
 const window=runtime.open();await new Promise(resolve=>window.webContents.once('did-finish-load',resolve));
 const wait=async test=>{for(let i=0;i<100;i++){if(await test())return;await new Promise(r=>setTimeout(r,50))}throw Error('Offline UI timed out')};
 await wait(()=>window.webContents.executeJavaScript('document.querySelectorAll("#products button").length===1'));
 await window.webContents.executeJavaScript('document.querySelector("#products button").click();document.querySelector("#products button").click();document.getElementById("pay").click()');await wait(async()=>(await runtime.ledger.pending()).length===1);await wait(()=>window.webContents.executeJavaScript('document.getElementById("receipt").textContent.includes("17,90")'));assert.equal((await runtime.ledger.pending()).length,1);assert.equal(await window.webContents.executeJavaScript('document.getElementById("receipt").textContent.includes("19 %") && document.getElementById("receipt").textContent.includes("MwSt: 2,86")'),true);
 assert.equal(await window.webContents.executeJavaScript('typeof offlinePOS.export==="function" && !!document.getElementById("export")'),true);
 const report=await runtime.ledger.reconciliation();assert.equal(report.total,1);assert.equal(report.sales[0].state,'pending');
 await window.webContents.executeJavaScript('document.getElementById("sync").click()');await wait(()=>window.webContents.executeJavaScript('offlinePOS.view().then(v=>v.sync.state==="login")'));assert.equal((await runtime.ledger.pending()).length,1);
 const reload=new Promise(resolve=>window.webContents.once('did-finish-load',resolve));window.webContents.reload();await reload;await wait(()=>window.webContents.executeJavaScript('document.querySelectorAll("#sales button").length===1'));await window.webContents.executeJavaScript('document.querySelector("#sales button").click()');assert.equal(await window.webContents.executeJavaScript('document.getElementById("receipt").textContent.includes("OFF-")'),true);
 // Restart both before persistence and after persistence but before UI acknowledgement.
 for(const alreadySaved of [false,true]){
  const before=await runtime.ledger.pendingCount();
  const request={id:crypto.randomUUID(),snapshotId:snapshot.id,restaurantId:snapshot.restaurants[0].id,createdAt:new Date().toISOString(),paymentMethod:'cash',items:[{productId:snapshot.products[0].id,quantity:1}]};
  if(alreadySaved)await runtime.ledger.sale(request);
  await window.webContents.executeJavaScript(`localStorage.setItem('bringness.offline.pending-sale.v1',${JSON.stringify(JSON.stringify(request))})`);
  const loaded=new Promise(resolve=>window.webContents.once('did-finish-load',resolve));window.webContents.reload();await loaded;
  await wait(()=>window.webContents.executeJavaScript('document.getElementById("pay").disabled===false && document.getElementById("items").children.length===1'));
  await window.webContents.executeJavaScript('document.getElementById("pay").click()');
  await wait(async()=>await runtime.ledger.pendingCount()===before+1);
  await wait(()=>window.webContents.executeJavaScript(`document.getElementById('receipt').textContent.includes(${JSON.stringify(request.id)}) && localStorage.getItem('bringness.offline.pending-sale.v1')===null`));
  assert.equal((await runtime.ledger.pending()).filter(s=>s.id===request.id).length,1);
 }
 rogue=new BrowserWindow({show:false,webPreferences:{preload:path.join(__dirname,'offline-preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});await rogue.loadURL('data:text/html,<title>Unauthorized frame</title>');const denied=await rogue.webContents.executeJavaScript('offlinePOS.view().then(()=>false,()=>true)');assert.equal(denied,true);assert.equal(await rogue.webContents.executeJavaScript('offlinePOS.sync().then(()=>false,()=>true)'),true);assert.equal(await rogue.webContents.executeJavaScript('offlinePOS.export().then(()=>false,()=>true)'),true);
 // Closing the runtime must revoke IPC access and prevent window recreation.
 await runtime.close();
 assert.equal(window.webContents.isDestroyed(),true);
 assert.throws(()=>runtime.open(),/bereits geschlossen/);
 assert.equal(await rogue.webContents.executeJavaScript('offlinePOS.view().then(()=>false,()=>true)'),true);
 assert.equal(await rogue.webContents.executeJavaScript('offlinePOS.export().then(()=>false,()=>true)'),true);
 console.log('Electron offline cash UI, pre/post-persistence payment recovery, PGlite persistence and unauthorized IPC rejection passed.');rogue.destroy();app.exit(0);
 }catch(e){console.error(e);rogue?.destroy();if(runtime)await runtime.close();app.exit(1)}});
