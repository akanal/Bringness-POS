// Static local preview: deliberately independent of production and payment services.
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../apps/web/public/shop/',import.meta.url));
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon'};
export function createPreviewServer(){
 return http.createServer(async(req,res)=>{
  res.setHeader('cache-control','no-store');
  res.setHeader('x-content-type-options','nosniff');
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405,{allow:'GET, HEAD'});res.end();return;}
  try{
   const pathname=new URL(req.url,'http://localhost').pathname;
   if(pathname.startsWith('/api/')){res.writeHead(503,{'content-type':'application/json'});res.end(req.method==='HEAD'?undefined:JSON.stringify({code:'SHOP_NOT_READY',canPay:false,canActivate:false,checkoutConnected:false}));return;}
   const relative=decodeURIComponent(pathname.replace(/^\/shop(?:\/|$)/,''));
   if(relative.includes('\0')||relative.includes('\\')){res.writeHead(404);res.end();return;}
   const filename=path.resolve(root,relative==='/'||relative===''?'index.html':relative.replace(/^\//,''));
   const boundary=path.relative(root,filename);
   if(boundary==='..'||boundary.startsWith('..'+path.sep)||path.isAbsolute(boundary)){res.writeHead(404);res.end();return;}
   const data=await readFile(filename);
   res.writeHead(200,{'content-type':types[path.extname(filename)]||'application/octet-stream','content-length':data.length});
   res.end(req.method==='HEAD'?undefined:data);
  }catch{res.writeHead(404);res.end('Not found');}
 });
}
export function previewPort(args=process.argv,env=process.env){
 const flag=args.indexOf('--port');
 const raw=flag>=0?args[flag+1]:(env.PORT||'5173');
 if(!/^\d+$/.test(raw??'')||Number(raw)<1||Number(raw)>65535)throw new Error('Port muss zwischen 1 und 65535 liegen.');
 return Number(raw);
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const port=previewPort(),server=createPreviewServer();
  server.on('error',error=>{console.error(error.code==='EADDRINUSE'?`Port ${port} ist belegt. Bisherige Vorschau mit Strg+C stoppen oder --port ${port===65535?5173:port+1} verwenden.`:'Lokale Vorschau konnte nicht gestartet werden.');process.exitCode=1;});
  server.listen(port,'127.0.0.1',()=>console.log(`Local shop preview listening\nShop öffnen: http://localhost:${port}\nDieses Fenster offen lassen. Beenden: Strg+C.`));
 }catch(error){console.error(error.message);process.exitCode=1;}
}
