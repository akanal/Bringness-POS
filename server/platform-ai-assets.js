import fs from 'node:fs/promises';
const assets=new Set(['ai-workspace.js','ai-workspace.css','ai-language.js','ai-barcodes.js','ai-csv-parser.js','ai-collection.js','ai-subscriptions.js','ai-settlements.js','ai-ads.js','ai-csv-export.js','bringness-ai-logo.svg','bringness-ai-symbol.svg']);
export async function handlePlatformAiAssets(req,res){
 const p=new URL(req.url,'http://local').pathname;
 if(p!=='/admin/ai-workspace.html'&&!p.startsWith('/admin/ai-assets/'))return false;
 const send=(status,body,type)=>{res.writeHead(status,{'content-type':type,'cache-control':'no-store','x-content-type-options':'nosniff'});res.end(req.method==='HEAD'?'':body);return true};
 if(!['GET','HEAD'].includes(req.method))return send(405,'Methode nicht erlaubt','text/plain');
 if(p==='/admin/ai-workspace.html'){
  let html=await fs.readFile(new URL('../apps/web/public/ai-workspace.html',import.meta.url),'utf8');
  html=html.replaceAll('/ai.html','/admin/').replace(/\/assets\/(bringness-ai-[a-z.-]+)/g,'/admin/ai-assets/$1').replace(/\/(ai-[a-z-]+\.(?:js|css))/g,'/admin/ai-assets/$1').replace('Mein Arbeitsbereich – Bringness AI','AI-Verwaltung – Bringness POS').replace('Bringness AI Startseite','Zur POS-Verwaltung');
  return send(200,html,'text/html; charset=utf-8');
 }
 const file=p.slice('/admin/ai-assets/'.length);if(!assets.has(file))return send(404,'Nicht gefunden','text/plain');
 const folder=file.endsWith('.svg')?'assets/':'';
 const body=await fs.readFile(new URL('../apps/web/public/'+folder+file,import.meta.url));
 return send(200,body,file.endsWith('.css')?'text/css; charset=utf-8':file.endsWith('.svg')?'image/svg+xml':'text/javascript; charset=utf-8');
}
