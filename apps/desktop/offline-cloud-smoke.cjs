// Runs the unmodified Electron IPC/runtime/synchronizer against the actual HTTP
// offline handler. Only the HTTPS transport is redirected to a loopback fixture;
// no request may reach production and no server receipt/SQL result is mocked.
const {app,BrowserWindow,shell,protocol}=require('electron');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'bringness-electron-cloud-'));app.setPath('userData',directory);
app.on('window-all-closed',()=>{});
app.whenReady().then(async()=>{
 let cloud,runtime,online,window;const nativeFetch=globalThis.fetch;
 try{
  cloud=await (await import('../../server/ai-tests/offline-http-fixture.mjs')).createOfflineHttpFixture();
  protocol.handle('https',request=>{
   assert.equal(request.url,'https://bringness.de/pos/');
   return new Response('<!doctype html><title>Isolated online session fixture</title>',{headers:{'content-type':'text/html'}});
  });
  globalThis.fetch=(url,options)=>{
   const parsed=new URL(url);assert.equal(parsed.origin,'https://bringness.de');assert.match(parsed.pathname,/^\/api\/v1\/offline\/(catalog|batch)$/);assert.equal(options.redirect,'error');
   return nativeFetch(cloud.base+parsed.pathname,options);
  };
  online=new BrowserWindow({show:false,webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true}});await online.loadURL('https://bringness.de/pos/');
  const login=async token=>online.webContents.executeJavaScript(token?`localStorage.setItem('bringness-pos-token',${JSON.stringify(token)})`:"localStorage.removeItem('bringness-pos-token')");
  let token=await cloud.issueSession();await login(token);
  const wait=async predicate=>{for(let i=0;i<200;i++){if(await predicate())return;await new Promise(resolve=>setTimeout(resolve,50));}throw Error('Electron/cloud state timed out');};
  const install=async()=>{
   runtime=await require('./offline-runtime.cjs').install({app,BrowserWindow,shell,onlineWindow:()=>online,deviceKey:cloud.deviceKey,showOffline:false});
   window=runtime.open();await new Promise(resolve=>window.webContents.once('did-finish-load',resolve));
  };
  const sync=()=>window.webContents.executeJavaScript('offlinePOS.sync()');
  const sale=async()=>{
   await wait(()=>window.webContents.executeJavaScript('document.querySelectorAll("#products button").length===1'));
   await window.webContents.executeJavaScript('document.querySelector("#products button").click()');
   await wait(()=>window.webContents.executeJavaScript('document.getElementById("pay").disabled===false'));
   await window.webContents.executeJavaScript('document.getElementById("pay").click()');
   await wait(async()=>await runtime.ledger.pendingCount()===1);
   const request=(await runtime.ledger.pending())[0].request;
   await wait(()=>window.webContents.executeJavaScript(`document.getElementById('receipt').textContent.includes(${JSON.stringify(request.id)})`));
   return request.id;
  };
  const counts=async n=>assert.deepEqual(await cloud.counts(),{orders:n,receipts:n,payments:n,imports:n,cash:n*895});
  await install();assert.equal((await sync()).state,'success');
  const imported=[];
  for(const phase of ['before','after']){
   cloud.setMode(phase);const id=await sale();
   assert.equal((await sync()).state,'error');assert.equal(await runtime.ledger.pendingCount(),1);
   assert(cloud.counters().failures>0);await counts(imported.length+(phase==='after'?1:0));
   // Reopen the actual native runtime and its filesystem-backed local database.
   await runtime.close();await install();assert.equal(await runtime.ledger.pendingCount(),1);
   assert.equal((await runtime.ledger.pending())[0].id,id);
   cloud.setMode('normal');assert.equal((await sync()).state,'success');assert.equal(await runtime.ledger.pendingCount(),0);
   imported.push(id);await counts(imported.length);
   const before=await cloud.mappings();assert.equal((await sync()).state,'success');assert.deepEqual(await cloud.mappings(),before);
  }
  const id=await sale();
  await login(null);assert.equal((await sync()).state,'login');assert.equal(await runtime.ledger.pendingCount(),1);await counts(2);
  await login(token);await cloud.expire(token);assert.equal((await sync()).state,'error');assert.equal(await runtime.ledger.pendingCount(),1);await counts(2);
  token=await cloud.issueSession();await login(token);await cloud.ownerRole('waiter');assert.equal((await sync()).state,'error');assert.equal(await runtime.ledger.pendingCount(),1);await counts(2);
  await cloud.ownerRole('owner');cloud.setMode('unavailable');assert.equal((await sync()).state,'error');assert.equal(await runtime.ledger.pendingCount(),1);await counts(2);
  // A disabled device cannot refresh its catalog, but valid historical sales
  // remain importable: revocation must not erase money already collected.
  cloud.setMode('normal');await cloud.deviceEnabled(false);assert.equal((await sync()).state,'warning');assert.equal(await runtime.ledger.pendingCount(),0);await counts(3);
  const acknowledged=await cloud.mappings();assert.equal(acknowledged.length,3);assert.equal(new Set(acknowledged.map(x=>x.order_id)).size,3);assert(acknowledged.some(x=>x.id===id));
  await cloud.deviceEnabled(true);assert.equal((await sync()).state,'success');assert.deepEqual(await cloud.mappings(),acknowledged);
  await runtime.close();runtime=null;await install();assert.equal(await runtime.ledger.pendingCount(),0);assert.deepEqual(await cloud.mappings(),acknowledged);
  const report=await runtime.ledger.reconciliation();assert.equal(report.sales.length,3);assert(report.sales.every(s=>s.state==='synced'));
  // Native synchronizer must not persist its online bearer token in the ledger.
  assert(!JSON.stringify(report).includes(token));
  console.log('Actual Electron/cloud HTTP sync passed: socket loss before/after commit, native restart, stable cloud identities, 401/403, re-login, 503 and device revocation without lost historical cash.');
 }catch(error){console.error(error);process.exitCode=1;}
 finally{
  globalThis.fetch=nativeFetch;if(runtime)await runtime.close();online?.destroy();if(cloud)await cloud.close();
  protocol.unhandle('https');try{fs.rmSync(directory,{recursive:true,force:true});}catch{/* Electron may still hold its disposable Chromium profile until process exit. */}app.exit(process.exitCode||0);
 }
});
