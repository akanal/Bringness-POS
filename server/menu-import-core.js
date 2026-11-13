import crypto from 'node:crypto';
export const menuKey=s=>String(s).normalize('NFKC').trim().toLocaleLowerCase('de-DE').replace(/\s+/g,' ');
export const menuFail=(message,status=400)=>{throw Object.assign(Error(message),{status})};
export function menuPreview(text){
 if(typeof text!=='string'||!text.trim()||text.length>80000)menuFail('Bitte lesbaren Text bis 80.000 Zeichen verwenden.');
 const rows=[],warnings=[];let category='',ignored=0;
 const lines=text.split(/\r?\n/);for(const raw of lines.slice(0,2000)){
  const line=raw.trim();if(!line||/^--- Seite \d+ ---$/.test(line))continue;
  const prices=[...line.matchAll(/(?<![\d.,])(?:\d{1,6}[,.]\d{2}(?!\d)|\d{1,6}(?=\s*(?:€(?:\s|$)|EUR\b)))/gi)];
  if(!prices.length){if(line.length<=100&&/[\p{L}]/u.test(line)&&!/[\d]/.test(line)&&(line===line.toLocaleUpperCase('de-DE')||line.endsWith(':'))&&!/^(SPEISEKARTE|MENU|MENÜ|---)/i.test(line))category=line.replace(/:$/,'');else ignored++;continue}
  if(rows.length>=100){warnings.push('Mehr als 100 Preiszeilen: restliche Artikel in einem weiteren Durchgang erfassen.');break}
  const last=prices.at(-1),suffix=line.slice(last.index+last[0].length).trim();
  const unambiguous=prices.length===1&&/^(?:€|EUR)?\s*$/i.test(suffix);
  const name=line.slice(0,prices[0].index).replace(/^\d{1,3}[.)]\s+/,'').replace(/[.·…\s]+$/,'').trim();
  const value=unambiguous?Math.round(Number(last[0].replace(',','.'))*100):null;
  rows.push({category,name:name.slice(0,160),price_cents:value,tax_rate:null,source:line.slice(0,500),selected:unambiguous&&Boolean(name),warning:!unambiguous?'Mehrere Preise oder unklare Zuordnung: bitte auf einzelne Artikel aufteilen.':!category?'Kategorie ergänzen.':'Kategorie, Artikel und Preis mit dem Original prüfen.'});
 }
 if(lines.length>2000)warnings.push('Nur die ersten 2.000 Textzeilen wurden vorgeschlagen.');
 if(ignored)warnings.push(ignored+' Textzeilen ohne eindeutigen Preis wurden nicht als Artikel übernommen.');
 if(!rows.length)warnings.push('Keine eindeutigen Preiszeilen gefunden. Erkannten Text korrigieren oder Artikel manuell ergänzen.');
 return {text,rows,warnings,notice:'Vorschläge sind ungeprüft. Kategorien, Namen, Bruttopreise und MwSt. vor Übernahme kontrollieren. Zutaten und Allergene werden nicht ergänzt.'};
}
export function reviewedMenu(body){
 if(body.confirmed!==true||!Array.isArray(body.rows)||body.rows.length<1||body.rows.length>100)menuFail('1 bis 100 ausgewählte Artikel ausdrücklich bestätigen.');
 const seen=new Set();return body.rows.map(row=>{
  if(!row||typeof row!=='object'||typeof row.category!=='string'||typeof row.name!=='string')menuFail('Kategorie und Artikelname fehlen.');
  const category=row.category.trim(),name=row.name.trim();
  if(!category||category.length>100||!name||name.length>160||!Number.isSafeInteger(row.price_cents)||row.price_cents<0||row.price_cents>100000000||![0,7,19].includes(row.tax_rate))menuFail('Kategorie, Artikel, Preis und MwSt. jeder Zeile prüfen.');
  const key=menuKey(category)+'\u0000'+menuKey(name);if(seen.has(key))menuFail('Ein Artikel ist in dieser Kategorie mehrfach ausgewählt.');seen.add(key);
  return {category,name,price_cents:row.price_cents,tax_rate:row.tax_rate};
 });
}
export const menuDigest=rows=>crypto.createHash('sha256').update(JSON.stringify(rows)).digest('hex');
