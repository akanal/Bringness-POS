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
export const normalizeName=value=>String(value||'').normalize('NFKC').toLocaleLowerCase('de-DE').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
function dateValue(value){let v=value;const m=String(value||'').match(/^(\d{2})[./](\d{2})[./](\d{4})$/);if(m)v=m[3]+'-'+m[2]+'-'+m[1];return /^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v?v:'';}
export function parseDeliveryLine(raw){
 const number='(\\d+(?:[.,]\\d+)?)',measure='(kg|g|ml|l|Liter|Stück|Stk\\.?)';
 const pack=raw.match(new RegExp('^(.*?)\\b'+number+'\\s*(?:Packungen?|Pck\\.?|Pakete?)?\\s*(?:x|×|à|a)\\s*'+number+'\\s*'+measure+'\\b','i'));
 const single=raw.match(new RegExp('^(.*?)\\b'+number+'\\s*'+measure+'\\b','i'));
 const m=pack||single;let quantity=null,packQuantity=null,unit='piece',unitKnown=Boolean(m),description=raw;
 if(m){description=m[1].trim();const label=(pack?m[4]:m[3]).toLowerCase();const factor=['g','ml'].includes(label)?.001:1;unit=['kg','g'].includes(label)?'kg':['l','liter','ml'].includes(label)?'l':'piece';if(pack){packQuantity=Number(m[3].replace(',','.'))*factor;quantity=Number(m[2].replace(',','.'))*packQuantity;}else quantity=Number(m[2].replace(',','.'))*factor;quantity=Math.round(quantity*1000)/1000;}
 const price=raw.match(/(?:Positionswert|Positionspreis|Gesamt(?:preis)?)\s*(?:netto)\s*[:=]?\s*(\d+(?:[.,]\d{2}))\s*(?:€|EUR)(?=\s|$)/i);
 if(!m)description=raw.replace(/(?:Positionswert|Positionspreis|Gesamt(?:preis)?)\s*netto.*$/i,'').trim();
 return {description:description.slice(0,200),quantity,unit,unitKnown,stockId:'',packQuantity,netCents:price?Math.round(Number(price[1].replace(',','.'))*100):null,reviewed:false,source:raw.slice(0,500),uncertain:!m};
}
export function textDraft(text,confidence=null){
 text=String(text||'').slice(0,80000);const readable=(text.match(/[\p{L}\p{N}]/gu)||[]).length>=30&&(confidence==null||confidence>=45);
 const supplierMatch=text.match(/^(?:Lieferant|Absender)\s*[:=]\s*(.+)$/im);
 const referenceMatch=text.match(/^(?:Lieferscheinnummer|Lieferschein(?:\s*[- ]?(?:Nr\.?|Nummer))?|LS[- ]?Nr\.?)\s*[:#=]?\s*([A-Z0-9][A-Z0-9/_-]*\d[A-Z0-9/_-]*|\d+)\s*$/im);
 const dateMatch=text.match(/^(?:Lieferdatum|Lieferscheindatum|Datum)\s*[:=]?\s*(\d{2}[./]\d{2}[./]\d{4}|\d{4}-\d{2}-\d{2})\s*$/im);
 const metadata={supplier:supplierMatch?.[1].trim().slice(0,200)||'',reference:referenceMatch?.[1]||'',deliveryDate:dateValue(dateMatch?.[1])};
 const rawLines=text.split(/\r?\n/).filter(s=>s.trim());const lines=rawLines.slice(0,100).map((raw,index)=>({...parseDeliveryLine(raw),sourceIndex:index,header:raw===supplierMatch?.[0]||raw===referenceMatch?.[0]||raw===dateMatch?.[0]||/^--- Seite \d+ ---$/.test(raw)||/^Lieferschein\s*$/i.test(raw)||/^(?:Pos\.?|Artikel(?:nummer)?)\s+.*(?:Menge|Bezeichnung)/i.test(raw)}));
 return {text,readable,confidence,metadata,warning:!readable?unreadable:rawLines.length>100?'Mehr als 100 Textzeilen: Dokument bitte aufteilen und alle Positionen prüfen.':'Vorausgefüllte Vorschläge mit dem Original vergleichen. Nur Abweichungen korrigieren, dann bestätigen.',lines};
}
export function suggestDelivery(draft,stocks,mappings=[],knownSuppliers=[]){
 const metadata={...draft.metadata};if(!metadata.supplier){const doc=normalizeName(draft.text),found=knownSuppliers.filter(s=>normalizeName(s)&&(' '+doc+' ').includes(' '+normalizeName(s)+' '));if(found.length===1)metadata.supplier=found[0];}
 const supplierKey=normalizeName(metadata.supplier);
 const lines=draft.lines.map(line=>{if(line.header)return {...line};const key=normalizeName(line.description);const remembered=mappings.filter(m=>m.supplier_key===supplierKey&&m.source_key===key);const ids=[...new Set(remembered.map(m=>m.stock_id))];let candidates=ids.length===1?stocks.filter(s=>s.id===ids[0]&&(!line.unitKnown||s.unit===line.unit)):[];let matchBasis=candidates.length===1?'Letzte bestätigte Zuordnung dieses Lieferanten':'';
 if(!candidates.length){candidates=stocks.filter(s=>normalizeName(s.name)===key&&(!line.unitKnown||s.unit===line.unit));matchBasis=candidates.length===1?'Eindeutiger Artikelname':'';}
 if(candidates.length!==1)return {...line,matchBasis:'Artikelzuordnung bitte prüfen'};
 const stock=candidates[0],mapping=remembered.find(m=>m.stock_id===stock.id);return {...line,stockId:stock.id,unit:stock.unit,packQuantity:line.packQuantity??(mapping?.pack_quantity==null?null:Number(mapping.pack_quantity)),matchBasis,packBasis:line.packQuantity==null&&mapping?.pack_quantity!=null?'Packungsinhalt aus letzter Bestätigung':''};});
 return {...draft,metadata,lines};
}
export function receiptLines(lines){
 if(!Array.isArray(lines)||!lines.length||lines.length>100)reject('Bitte 1 bis 100 Positionen prüfen');
 return lines.map(l=>{if(l.reviewed!==true||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(l.stockId)))reject('Alle Artikelzuordnungen ausdrücklich prüfen');
 const quantity=Number(l.quantity);if(typeof l.quantity!=='number'||!Number.isFinite(quantity)||quantity<=0||quantity>1000000||Math.abs(quantity*1000-Math.round(quantity*1000))>0.00001)reject('Positive Menge mit höchstens drei Nachkommastellen erforderlich');
 if(!['kg','l','piece'].includes(l.unit))reject('Einheit prüfen');
 const packQuantity=l.packQuantity==null||l.packQuantity===''?null:Number(l.packQuantity);if(packQuantity!=null&&(!Number.isFinite(packQuantity)||packQuantity<=0||packQuantity>1000000||Math.abs(packQuantity*1000-Math.round(packQuantity*1000))>.00001))reject('Packungsinhalt prüfen');
 const netCents=l.netCents==null||l.netCents===''?null:Number(l.netCents);if(netCents!=null&&(typeof l.netCents!=='number'||!Number.isSafeInteger(netCents)||netCents<0||netCents>100000000))reject('Netto-Gesamtpreis der Position prüfen');
 return {stockId:l.stockId,quantity,unit:l.unit,packQuantity,netCents,reviewed:true,...(Number.isInteger(l.sourceIndex)&&l.sourceIndex>=0&&l.sourceIndex<100?{sourceIndex:l.sourceIndex}:{})};});
}
