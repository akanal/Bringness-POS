import crypto from 'node:crypto';
export const MAX_BYTES=8*1024*1024;
export const unreadable='Der Lieferschein ist nicht ausreichend lesbar. Bitte fotografiere ihn erneut – vollständig, scharf und bei guter Beleuchtung.';
export function reject(message,status=400){const e=new Error(message);e.status=status;throw e;}
export function documentBytes(b){
 if(typeof b.data!=='string'||b.data.length>Math.ceil(MAX_BYTES/3)*4||!/^([A-Za-z0-9+/]{4})*([A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(b.data))reject('Datei fehlt oder ist zu groß');
 const bytes=Buffer.from(b.data,'base64');if(!bytes.length||bytes.length>MAX_BYTES)reject('Datei fehlt oder ist zu groß');
 const mime=bytes.subarray(0,5).toString()==='%PDF-'?'application/pdf':bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?'image/png':bytes[0]===255&&bytes[1]===216&&bytes[2]===255?'image/jpeg':null;
 if(!mime)reject('Bitte ein PDF, JPEG oder PNG hochladen');
 return {bytes,mime,hash:crypto.createHash('sha256').update(bytes).digest('hex')};
}
export function textDraft(text,confidence=null){
 text=String(text||'').slice(0,80000);const readable=(text.match(/[\p{L}\p{N}]/gu)||[]).length>=30&&(confidence==null||confidence>=45);
 const lines=[];for(const raw of text.split(/\r?\n/).filter(s=>s.trim())){const m=raw.match(/^(.*?)\b(\d+(?:[.,]\d+)?)\s*(kg|g|ml|l|Stück|Stk\.?)\b/i);const unit=m?.[3].toLowerCase();let quantity=m?Number(m[2].replace(',','.')):null;if(unit==='g'||unit==='ml')quantity/=1000;lines.push({description:(m?.[1]||raw).trim().slice(0,200),quantity,unit:unit==='g'||unit==='kg'?'kg':unit==='l'||unit==='ml'?'l':'piece',stockId:'',packQuantity:null,netCents:null,reviewed:false,source:raw.slice(0,500),uncertain:!m});if(lines.length===100)break;}
 return {text,readable,confidence,warning:readable?'Alle Positionen mit dem Original vergleichen. Mengen und Zuordnungen sind ungeprüfte Vorschläge.':unreadable,lines};
}
export function receiptLines(lines){
 if(!Array.isArray(lines)||!lines.length||lines.length>100)reject('Bitte 1 bis 100 Positionen prüfen');
 return lines.map(l=>{if(l.reviewed!==true||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(l.stockId)))reject('Alle Artikelzuordnungen ausdrücklich prüfen');
 const quantity=Number(l.quantity);if(typeof l.quantity!=='number'||!Number.isFinite(quantity)||quantity<=0||quantity>1000000||Math.abs(quantity*1000-Math.round(quantity*1000))>0.00001)reject('Positive Menge mit höchstens drei Nachkommastellen erforderlich');
 if(!['kg','l','piece'].includes(l.unit))reject('Einheit prüfen');
 const packQuantity=l.packQuantity==null||l.packQuantity===''?null:Number(l.packQuantity);if(packQuantity!=null&&(!Number.isFinite(packQuantity)||packQuantity<=0||packQuantity>1000000||Math.abs(packQuantity*1000-Math.round(packQuantity*1000))>.00001))reject('Packungsinhalt prüfen');
 const netCents=l.netCents==null||l.netCents===''?null:Number(l.netCents);if(netCents!=null&&(typeof l.netCents!=='number'||!Number.isSafeInteger(netCents)||netCents<0||netCents>100000000))reject('Netto-Gesamtpreis der Position prüfen');
 return {stockId:l.stockId,quantity,unit:l.unit,packQuantity,netCents,reviewed:true};});
}
