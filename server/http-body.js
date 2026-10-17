const invalid=(message='Ungültige Anfrage',status=400)=>Object.assign(Error(message),{status,code:status===413?'BODY_TOO_LARGE':'INVALID_BODY'});
export async function readRequestBytes(req,{maxBytes=65536}={}){
 if(!Number.isSafeInteger(maxBytes)||maxBytes<1)throw TypeError('Invalid request byte limit');
 if(req.aborted)throw invalid();
 const chunks=[];let size=0;
 const accept=part=>{
  const bytes=Buffer.isBuffer(part)?part:typeof part==='string'?Buffer.from(part):part instanceof Uint8Array?Buffer.from(part):null;
  if(!bytes)throw invalid();size+=bytes.length;
  if(size>maxBytes){req.resume?.();throw invalid('Anfrage zu groß',413);}
  chunks.push(bytes);
 };
 if(typeof req[Symbol.asyncIterator]!=='function'&&typeof req.on==='function'){
  await new Promise((resolve,reject)=>{
   let done=false;
   const finish=error=>{if(done)return;done=true;for(const [event,listener] of listeners)req.removeListener?.(event,listener);error?reject(error):resolve();};
   const listeners=[['data',part=>{try{accept(part);}catch(e){finish(e);}}],['end',()=>finish()],['aborted',()=>finish(invalid())],['error',()=>finish(invalid())]];
   for(const [event,listener] of listeners)req.on(event,listener);
  });
  return Buffer.concat(chunks,size);
 }
 // Keep the socket available long enough for the handler to return 400/413.
 const input=typeof req.iterator==='function'?req.iterator({destroyOnReturn:false}):req;
 try{
  for await(const part of input)accept(part);
 }catch(error){if(error?.code==='BODY_TOO_LARGE'||error?.code==='INVALID_BODY')throw error;throw invalid();}
 if(req.aborted)throw invalid();
 return Buffer.concat(chunks,size);
}
export async function readJsonObject(req,options={}){
 const bytes=await readRequestBytes(req,options);let value;
 try{const raw=new TextDecoder('utf-8',{fatal:true}).decode(bytes);value=raw?JSON.parse(raw):{};}
 catch{throw invalid();}
 if(value===null||typeof value!=='object'||Array.isArray(value))throw invalid();
 return value;
}

export function clientInputError(error){
 const known={AUTH_RATE_CAPACITY:[429,'Zugangsprüfung ausgelastet. Bitte später erneut versuchen.'],INVALID_BODY:[400,'Ungültige Anfrage'],BODY_TOO_LARGE:[413,'Anfrage zu groß'],INVALID_SECRET:[400,'Ungültige Zugangsdaten'],AUTH_CAPACITY:[503,'Zu viele gleichzeitige Zugangsprüfungen. Bitte kurz warten und erneut versuchen.']};
 const match=known[error?.code];return match?{status:match[0],error:match[1]}:null;
}
