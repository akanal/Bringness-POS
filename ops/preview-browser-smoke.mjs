import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import https from 'node:https';
import {execFileSync} from 'node:child_process';
const env=Object.fromEntries((await readFile(process.argv[2]||'.env.preview.local','utf8')).trim().split('\n').map(line=>{const at=line.indexOf('=');return [line.slice(0,at),line.slice(at+1)];}));
const secrets=Object.values(env);let browser,proxy,directory;
try{
 const {chromium}=await import(process.env.PREVIEW_TEST_PLAYWRIGHT);
 directory=await mkdtemp(path.join(os.tmpdir(),'bringness-preview-tls-'));
 const key=path.join(directory,'key.pem'),cert=path.join(directory,'cert.pem');
 execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',key,'-out',cert,'-days','1','-subj','/CN=localhost'],{stdio:'ignore'});
 proxy=https.createServer({key:await readFile(key),cert:await readFile(cert)},(req,res)=>{
  const upstream=http.request({hostname:'127.0.0.1',port:3016,path:req.url,method:req.method,headers:req.headers},response=>{res.writeHead(response.statusCode,response.headers);response.pipe(res);});upstream.on('error',()=>{res.writeHead(502);res.end();});req.pipe(upstream);
 });
 await new Promise(resolve=>proxy.listen(0,'127.0.0.1',resolve));
 const origin='https://127.0.0.1:'+proxy.address().port;
 browser=await chromium.launch({headless:true});
 const context=await browser.newContext({ignoreHTTPSErrors:true,httpCredentials:{username:'bringness-preview',password:env.PREVIEW_ACCESS_PASSWORD}});
 const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto(origin+'/pos/');await page.fill('#email','preview@example.test');await page.fill('#password',env.PREVIEW_OWNER_PASSWORD);await page.click('#authSubmit');await page.waitForSelector('#workspace.show');
 await page.waitForFunction(()=>document.getElementById('who')?.textContent.includes('Vorschau'));
 const aiResponse=await context.request.post(origin+'/api/ai/login',{data:{email:'preview@example.test',password:env.PREVIEW_OWNER_PASSWORD}});assert.equal(aiResponse.status(),200);const token=(await aiResponse.json()).token;secrets.push(token);
 await page.evaluate(token=>sessionStorage.setItem('bringness-ai-session',token),token);await page.goto(origin+'/ai-workspace.html');
 await page.waitForFunction(()=>!document.getElementById('workspace').hidden&&document.getElementById('identity').textContent.includes('Vorschau'));
 await page.locator('#tabs [data-view="stock"]').evaluate(button=>button.click());await page.waitForFunction(()=>document.getElementById('content').textContent.includes('Vorschau Mehl'));
 const fenced=await page.evaluate(()=>new Promise(resolve=>{document.addEventListener('securitypolicyviolation',event=>resolve(event.violatedDirective==='connect-src'),{once:true});fetch('https://example.invalid/blocked').catch(()=>{});setTimeout(()=>resolve(false),2000);}));assert.equal(fenced,true);
 assert.deepEqual(errors,[]);
 console.log('Actual preview browser passed: HTTPS access cookie, POS login, separate AI workspace/stock rendering, no page errors and browser external-connection fence.');
}catch(error){let message=String(error.message);for(const value of secrets)if(value)message=message.replaceAll(value,'[redacted]');console.error('Preview browser smoke failed: '+message);process.exitCode=1;}
finally{await browser?.close();if(proxy){proxy.closeAllConnections();await new Promise(resolve=>proxy.close(resolve));}if(directory)await rm(directory,{recursive:true,force:true});}
