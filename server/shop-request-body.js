// Bounded total JSON body deadline; never cancels database work.
export function assertEmptyShopRequest(req){
 const headers=req.headers||{},length=headers['content-length'];
 if(Object.hasOwn(headers,'transfer-encoding')||(length!==undefined&&length!=='0'))throw Object.assign(Error('INVALID_REQUEST'),{code:'INVALID_REQUEST'});
}
export function readShopRequestBytes(req,{timeoutMs=15000,maxBytes=4096}={}){
 if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>60000)throw TypeError('INVALID_SHOP_BODY_TIMEOUT');
 if(!Number.isSafeInteger(maxBytes)||maxBytes<1||maxBytes>16384)throw TypeError('INVALID_SHOP_BODY_LIMIT');
 if(typeof req?.on!=='function'||typeof req?.removeListener!=='function')return Promise.reject(Object.assign(Error('INVALID_BODY'),{code:'INVALID_BODY'}));
 return new Promise((resolve,reject)=>{
  const chunks=[];let size=0,done=false,timer;
  const fail=code=>Object.assign(Error(code),{code});
  const finish=(error,value)=>{
   if(done)return;done=true;clearTimeout(timer);
   for(const [event,listener] of listeners)req.removeListener(event,listener);
   chunks.length=0;
   if(error){req.pause?.();reject(error);}else resolve(value);
  };
  const listeners=[
   ['data',part=>{
    const bytes=Buffer.isBuffer(part)?part:typeof part==='string'?Buffer.from(part):part instanceof Uint8Array?Buffer.from(part):null;
    if(!bytes)return finish(fail('INVALID_BODY'));
    size+=bytes.length;if(size>maxBytes)return finish(fail('BODY_TOO_LARGE'));chunks.push(bytes);
   }],
   ['end',()=>{
    finish(null,Buffer.concat(chunks,size));
   }],
   ['aborted',()=>finish(fail('INVALID_BODY'))],
   ['error',()=>finish(fail('INVALID_BODY'))],
   ['close',()=>{if(!req.readableEnded)finish(fail('INVALID_BODY'));}]
  ];
  if(req.aborted||req.destroyed||req.readableEnded)return finish(fail('INVALID_BODY'));
  timer=setTimeout(()=>finish(fail('SHOP_BODY_TIMEOUT')),timeoutMs);
  for(const [event,listener] of listeners)req.on(event,listener);
 });
}

export function readShopRequestBody(req,options={}){
 return readShopRequestBytes(req,options).then(bytes=>{
  try{const raw=new TextDecoder('utf-8',{fatal:true}).decode(bytes),value=raw?JSON.parse(raw):{};
   if(!value||typeof value!=='object'||Array.isArray(value))throw Error();return value;
  }catch{throw Object.assign(Error('INVALID_BODY'),{code:'INVALID_BODY'});}
 });
}
