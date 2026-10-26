import {categoryMatches} from './departments.js?v=categories-20261026';
export const kindLabels=Object.freeze({physical:'Ware',digital:'Digitales Produkt',service:'Dienstleistung'});
export function offerHints(offer,all=[]){
 const hints=[];
 if(offer.tax==='review')hints.push('Steuerangabe noch offen.');
 if(offer.description.trim().length<80)hints.push('Beschreibung ergänzen: Merkmale, Umfang und wichtige Einschränkungen erläutern.');
 if(offer.kind==='physical'&&Number(offer.stock)===0)hints.push('Der Bestand steht auf null.');
 if(offer.kind==='physical'&&offer.delivery.trim().length<25)hints.push('Versandkosten, Liefergebiet und Lieferzeit genauer beschreiben.');
 if(offer.kind!=='physical'&&offer.fulfilment.trim().length<25)hints.push('Bereitstellung oder Leistungsumfang genauer beschreiben.');
 if(offer.sku&&all.some(row=>row.id!==offer.id&&row.sku.toLocaleLowerCase('de')===offer.sku.toLocaleLowerCase('de')))hints.push('Diese Artikelnummer wird auch in einem anderen Entwurf verwendet.');
 return hints;
}
export function filterOffers(rows,{query='',category='Alle',kind='all',review='all',sort='title',stock='all'}={}){
 const normalize=value=>String(value).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('de');
 const words=normalize(query.slice(0,120)).trim().split(/\s+/).filter(Boolean);
 const list=rows.filter(row=>categoryMatches(row.category,category)&&(kind==='all'||row.kind===kind)&&(stock==='all'||row.kind==='physical'&&(stock==='empty'?Number(row.stock)===0:Number(row.stock)>0))&&words.every(word=>normalize(`${row.title} ${row.category} ${row.sku} ${row.gtin} ${row.description} ${row.delivery} ${row.fulfilment}`).includes(word))&&(review==='all'||(review==='hints'?offerHints(row,rows).length>0:offerHints(row,rows).length===0)));
 const compare=(a,b)=>a.title.localeCompare(b.title,'de');
 if(sort==='price-desc')list.sort((a,b)=>b.netCents-a.netCents||compare(a,b));else if(sort==='price')list.sort((a,b)=>a.netCents-b.netCents||compare(a,b));else if(sort==='category')list.sort((a,b)=>a.category.localeCompare(b.category,'de')||compare(a,b));else list.sort(compare);
 return list;
}
