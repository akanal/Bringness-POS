import {validateOffer} from './offer-policy.js';
export const csvFields=[['title','Titel'],['category','Kategorie'],['kind','Art'],['price','Nettopreis EUR'],['tax','MwSt.'],['stock','Bestand'],['sku','Artikelnummer'],['gtin','GTIN'],['description','Beschreibung'],['condition','Zustand'],['delivery','Lieferung'],['fulfilment','Bereitstellung']];
const key=v=>v.normalize('NFKC').trim().toLocaleLowerCase('de').replace(/[.\s_%()-]/g,'');
const aliases={title:['name','produkt','produktname','title'],price:['nettopreis','price','preisnetto'],tax:['mwst','steuersatz','tax'],stock:['lagerbestand','stock'],sku:['sku'],gtin:['ean'],description:['description'],condition:['condition'],delivery:['lieferzeit','delivery'],kind:['kind'],fulfilment:['fulfilment']};
export function parseOfferCsv(text){
 if(typeof text!=='string'||new TextEncoder().encode(text).length>4000000)throw Error('CSV-Datei darf höchstens 4 MB groß sein.');
 text=text.replace(/^\ufeff/,'');const records=[];let row=[],cell='',quoted=false,closed=false,delimiter='';
 for(let i=0;i<=text.length;i++){const c=text[i];if(quoted){if(c===undefined)throw Error('Nicht geschlossenes Anführungszeichen in der CSV-Datei.');if(c==='"'){if(text[i+1]==='"'){cell+='"';i++;}else{quoted=false;closed=true;}}else cell+=c;continue;}
  if(c==='"'&&!cell&&!closed){quoted=true;continue;}
  if(!delimiter&&[';',',','\t'].includes(c))delimiter=c;
  const boundary=c===delimiter||c==='\n'||c==='\r'||c===undefined;
  if(closed&&!boundary)throw Error('Unerwarteter Text nach einem Anführungszeichen.');
  if(boundary){row.push(cell);if(row.length>40)throw Error('CSV-Datei hat mehr als 40 Spalten.');cell='';closed=false;if(c!==delimiter){if(row.some(v=>v.trim()))records.push(row);row=[];if(c==='\r'&&text[i+1]==='\n')i++;if(records.length>201)throw Error('Höchstens 200 Datenzeilen pro CSV-Datei.');}}else cell+=c;
 }
 if(records.length<2||records[0].length<2)throw Error('CSV benötigt eine Kopfzeile und mindestens eine Datenzeile.');const headers=records.shift();if(headers.some(v=>!v.trim())||new Set(headers.map(key)).size!==headers.length)throw Error('Spaltenüberschriften müssen gefüllt und eindeutig sein.');if(records.some(r=>r.length!==headers.length))throw Error('Die Anzahl der Spalten ist nicht in jeder Zeile gleich.');
 const mapping={};for(const [field,label]of csvFields){const choices=headers.map((h,i)=>[key(h),i]).filter(([h])=>[key(label),...(aliases[field]||[]).map(key)].includes(h));mapping[field]=choices.length===1?choices[0][1]:-1;}
 return {headers,rows:records,mapping};
}
export function inspectCsvRows(source,mapping,defaults={}){return source.rows.map((cells,index)=>{const raw=Object.fromEntries(csvFields.map(([field])=>[field,mapping[field]===-2?String(defaults[field]??'').trim():Number.isInteger(mapping[field])&&mapping[field]>=0?String(cells[mapping[field]]??'').trim():'' ]));
 const kinds={ware:'physical',waren:'physical',physical:'physical',digital:'digital','digitales produkt':'digital',dienstleistung:'service',service:'service'},conditions={neu:'new',new:'new',gebraucht:'used',used:'used','generalüberholt':'refurbished',refurbished:'refurbished'};
 raw.kind=kinds[raw.kind.toLocaleLowerCase('de')]||raw.kind;raw.condition=conditions[raw.condition.toLocaleLowerCase('de')]||raw.condition;raw.tax=raw.tax.replace(/\s*%$/,'');if(!raw.tax)raw.tax='review';
 try{if(!['review','0','7','19'].includes(raw.tax))throw Error('MwSt. muss 0, 7, 19 oder review sein.');if(!raw.title)throw Error('Titel fehlt.');if(!raw.category)throw Error('Kategorie fehlt.');if(!raw.kind)throw Error('Art fehlt (physical, digital oder service).');if(!raw.condition)throw Error('Zustand fehlt (new, used oder refurbished).');return {index,sourceLine:index+2,offer:validateOffer(raw),error:null};}catch(e){return {index,sourceLine:index+2,title:raw.title.slice(0,120)||'CSV-Zeile '+(index+2),offer:null,error:'CSV-Zeile '+(index+2)+': '+e.message};}
 });}
export function offerCsvTemplate(){return '\ufeff'+csvFields.map(([,label])=>'"'+label+'"').join(';')+'\r\n'+['Beispielartikel – ersetzen','Hardware','physical','10,00','review','0','','','Eigene Beschreibung eintragen','new','Tatsächliche Lieferzeit eintragen',''].map(v=>'"'+v.replaceAll('"','""')+'"').join(';')+'\r\n';}
