import bwipjs from 'bwip-js';

// Encode the immutable number itself, never a URL or an invented EAN product code.
export function invoiceBarcode(doc,number,{x=57,y=76,width=240,height=24}={}){
 const value=String(number||'');if(!value||value.length>80||!/^[\x20-\x7e]+$/.test(value))throw Error('INVALID_INVOICE_BARCODE');
 const {sbs}=bwipjs.raw({bcid:'code128',text:value})[0];
 const units=sbs.reduce((sum,n)=>sum+n,0),module=Math.min(1,width/(units+20));
 if(module<0.5)throw Error('INVOICE_BARCODE_TOO_WIDE');
 let cursor=x+10*module;doc.save().fillColor('#000000');
 sbs.forEach((n,index)=>{if(index%2===0)doc.rect(cursor,y,n*module,height).fill();cursor+=n*module;});doc.restore();
 return {value,x,y,width:(units+20)*module,height,module};
}
