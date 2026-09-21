import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
const port=Number(process.env.PORT||8080);
const root=join(process.cwd(),"apps","web","public");
const types={".html":"text/html; charset=utf-8",".css":"text/css; charset=utf-8",".js":"text/javascript; charset=utf-8",".svg":"image/svg+xml",".json":"application/json; charset=utf-8"};
http.createServer(async(req,res)=>{
  if(req.url==="/health"){res.writeHead(200,{"content-type":"application/json"});return res.end(JSON.stringify({status:"ok",service:"bringness-pos"}));}
  let path=(req.url||"/").split("?")[0]; if(path==="/") path="/index.html";
  if(["/datenschutz","/impressum","/ueber-uns"].includes(path)) path+="/index.html";
  const safe=normalize(path).replace(/^([.][.][/\\])+/, "");
  try{const data=await readFile(join(root,safe));res.writeHead(200,{"content-type":types[extname(safe)]||"application/octet-stream","x-content-type-options":"nosniff","referrer-policy":"strict-origin-when-cross-origin","x-frame-options":"SAMEORIGIN"});res.end(data);}
  catch{res.writeHead(404,{"content-type":"text/plain; charset=utf-8"});res.end("Nicht gefunden");}
}).listen(port,"0.0.0.0",()=>console.log("Bringness POS listening on",port));
