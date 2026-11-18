(()=>{
 const source=value=>typeof value==='string'&&/^(data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+|https?:\/\/[^\s]+|\/(?!\/)[^\s]+)$/.test(value)?value:null;
 async function prepare(file){
  if(!file||!['image/png','image/jpeg','image/webp'].includes(file.type))throw Error('Bitte ein JPEG-, PNG- oder WebP-Foto auswählen. HEIC bitte vorher als JPEG exportieren.');
  if(file.size>8*1024*1024||!file.size)throw Error('Bitte ein Foto bis 8 MB auswählen.');
  const url=URL.createObjectURL(file),image=new Image();
  try{
   await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{image.src='';reject(Error('Das Foto konnte nicht rechtzeitig geöffnet werden.'));},20000);image.onload=()=>{clearTimeout(timer);resolve();};image.onerror=()=>{clearTimeout(timer);reject(Error('Das Foto ist beschädigt oder wird von diesem Browser nicht unterstützt.'));};image.src=url;});
   if(!image.naturalWidth||!image.naturalHeight||image.naturalWidth*image.naturalHeight>40000000)throw Error('Das Foto ist zu groß. Bitte auf höchstens 40 Megapixel verkleinern.');
   const canvas=document.createElement('canvas');let edge=Math.min(1200,Math.max(image.naturalWidth,image.naturalHeight));
   for(let step=0;step<10;step++,edge=Math.max(100,Math.floor(edge*.75))){
    const scale=Math.min(1,edge/Math.max(image.naturalWidth,image.naturalHeight));canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
    const ctx=canvas.getContext('2d');if(!ctx)throw Error('Die Fotoverarbeitung ist in diesem Browser nicht verfügbar.');ctx.drawImage(image,0,0,canvas.width,canvas.height);
    const type=file.type==='image/png'?'image/png':file.type==='image/webp'?'image/webp':'image/jpeg';
    for(const quality of type==='image/png'?[1]:[.86,.72,.58]){const value=canvas.toDataURL(type,quality);if(source(value)&&value.length<=190000)return value;}
   }
   throw Error('Das Foto konnte nicht ausreichend verkleinert werden. Bitte ein kleineres Bild auswählen.');
  }finally{image.onload=image.onerror=null;URL.revokeObjectURL(url);}
 }
 window.BringnessProductPhoto={prepare,source};
})();
