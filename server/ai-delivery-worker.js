import {parentPort,workerData} from 'node:worker_threads';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
let worker;
try{
 const bytes=Buffer.from(workerData.bytes);let text='',confidence=null;
 const canvas=await import('@napi-rs/canvas');
 globalThis.DOMMatrix=canvas.DOMMatrix;globalThis.ImageData=canvas.ImageData;globalThis.Path2D=canvas.Path2D;
 const {createWorker}=await import('tesseract.js');
 const data=require('@tesseract.js-data/deu');
 async function ocr(image){if(!worker)worker=await createWorker('deu',1,{langPath:data.langPath,cacheMethod:'none',gzip:true,logger:()=>{}});const result=await worker.recognize(image);confidence=confidence==null?result.data.confidence:Math.min(confidence,result.data.confidence);return result.data.text;}
 if(workerData.mime==='application/pdf'){
  const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task=pdfjs.getDocument({data:new Uint8Array(bytes),isEvalSupported:false,useSystemFonts:true,maxImageSize:12000000});const doc=await task.promise;
  if(doc.numPages>10)throw Error('TOO_MANY_PAGES');
  for(let n=1;n<=doc.numPages;n++){const page=await doc.getPage(n);const content=await page.getTextContent();let extracted='';for(const item of content.items){extracted+=item.str+' ';if(item.hasEOL)extracted+='\n';}
   if((extracted.match(/[\p{L}\p{N}]/gu)||[]).length<30){const v=page.getViewport({scale:1.8});if(v.width*v.height>12000000)throw Error('IMAGE_TOO_LARGE');const c=canvas.createCanvas(Math.ceil(v.width),Math.ceil(v.height));await page.render({canvasContext:c.getContext('2d'),viewport:v}).promise;extracted=await ocr(c.toBuffer('image/png'));}
   text+='\n--- Seite '+n+' ---\n'+extracted;if(text.length>80000)throw Error('TEXT_TOO_LONG');await page.cleanup();
  }await task.destroy();
 }else{const img=await canvas.loadImage(bytes);if(img.width*img.height>16000000)throw Error('IMAGE_TOO_LARGE');text=await ocr(bytes);}
 parentPort.postMessage({text,confidence});
}catch(e){parentPort.postMessage({error:e.message?.includes('TOO_MANY_PAGES')?'PDF hat mehr als zehn Seiten':e.message?.includes('IMAGE_TOO_LARGE')?'Bildauflösung ist zu groß':'Dokument konnte nicht ausgelesen werden. Bitte eine andere Datei versuchen oder Positionen manuell prüfen.'});}
finally{if(worker)await worker.terminate();}
