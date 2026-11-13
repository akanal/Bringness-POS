import {Worker} from 'node:worker_threads';
import {documentBytes} from './ai-delivery-core.js';
import {menuFail} from './menu-import-core.js';
let busy=false;
export async function recognizeMenuFile(body,{WorkerClass=Worker,timeoutMs=90000}={}){
 const {bytes,mime}=documentBytes(body);if(busy)menuFail('Eine Dokumenterkennung läuft bereits. Bitte gleich erneut versuchen.',429);busy=true;let worker;
 try{return await new Promise((resolve,reject)=>{
  let done=false;const finish=(error,value)=>{if(done)return;done=true;clearTimeout(timer);error?reject(error):resolve(value)};
  const timer=setTimeout(()=>finish(Object.assign(Error('Erkennung dauert zu lange. Bitte Datei aufteilen oder Text einfügen.'),{status:422})),timeoutMs);
  try{worker=new WorkerClass(new URL('./ai-delivery-worker.js',import.meta.url),{execArgv:[],workerData:{bytes,mime},resourceLimits:{maxOldGenerationSizeMb:384}})}catch{finish(Object.assign(Error('Texterkennung nicht verfügbar.'),{status:503}));return}
  worker.once('message',r=>{if(r?.error||typeof r?.text!=='string'||!r.text.trim()||r.text.length>80000){finish(Object.assign(Error(r?.error?'Datei konnte nicht ausgelesen werden. Bitte andere Datei oder Text verwenden.':'Kein lesbarer Text gefunden.'),{status:422}));return}finish(null,{text:r.text,confidence:Number.isFinite(r.confidence)?r.confidence:null})});
  worker.once('error',()=>finish(Object.assign(Error('Texterkennung nicht verfügbar.'),{status:503})));worker.once('exit',()=>{if(!done)finish(Object.assign(Error('Texterkennung beendet. Bitte erneut versuchen.'),{status:503}))});
 })}finally{try{await worker?.terminate()}catch{}busy=false}
}
