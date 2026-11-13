import {menuFail} from './menu-import-core.js';
const keys={category:['kategorie','category','warengruppe','gruppe'],name:['artikel','artikelname','produkt','produktname','name','product','item','bezeichnung','artikelbezeichnung','itemname'],price:['preis','bruttopreis','price','priceeur','preiseuro','preiscent','pricecents','price_cents','verkaufspreis','vkpreis','brutto','preisbrutto'],tax:['mwst','mwstsatz','steuersatz','tax','taxrate','tax_rate','vat']};
const key=s=>s.normalize('NFKC').toLowerCase().replace(/[^a-z0-9_]/g,'');
function records(text,separator){const out=[];let row=[],cell='',quoted=false,closed=false;
 const put=()=>{row.push(cell);cell='';closed=false;if(row.length>50)menuFail('CSV hat mehr als 50 Spalten.')};
 const finish=()=>{put();if(row.some(x=>x.trim()))out.push(row);row=[];if(out.length>102)menuFail('Bitte CSV auf höchstens 100 Artikel aufteilen.')};
 for(let i=0;i<text.length;i++){const c=text[i];if(quoted){if(c==='"'){if(text[i+1]==='"'){cell+='"';i++}else{quoted=false;closed=true}}else cell+=c;continue}if(c==='"'){if(cell||closed)menuFail('Ungültige Anführungszeichen in CSV.');quoted=true}else if(c===separator)put();else if(c==='\r'||c==='\n'){if(c==='\r'&&text[i+1]==='\n')i++;finish()}else{if(closed&&!/\s/.test(c))menuFail('Ungültiger Text nach CSV-Anführungszeichen.');if(!closed)cell+=c}}
 if(quoted)menuFail('CSV enthält ein nicht geschlossenes Textfeld.');if(cell||row.length||closed)finish();return out;
}
export function csvMenuPreview(text,options={}){
 if(!options||typeof options!=='object'||Array.isArray(options))menuFail('CSV-Einstellungen prüfen.');
 if(typeof text!=='string'||!text.trim()||text.length>80000||text.includes('\0'))menuFail('Bitte eine CSV mit höchstens 80.000 Zeichen verwenden.');text=text.replace(/^\uFEFF/,'');
 let separator=options.separator;if(separator&&![';',',','\t'].includes(separator))menuFail('Ungültiges CSV-Trennzeichen.');
 if(!separator){const candidates=[';',',','\t'].map(s=>{try{const r=records(text,s);return {s,r,width:r[0]?.length||0}}catch{return {s,width:0}}});separator=candidates.sort((a,b)=>b.width-a.width)[0].s}
 const all=records(text,separator);if(!all.length)menuFail('CSV ist leer.');const header=options.header!==false,columns=header?all[0]:all[0].map((_,i)=>'Spalte '+(i+1)),data=header?all.slice(1):all;
 if(!data.length||data.length>100)menuFail('CSV muss 1 bis 100 Artikel enthalten.');if(data.some(r=>r.length!==columns.length))menuFail('CSV-Zeilen haben unterschiedlich viele Spalten. Bitte Trennzeichen prüfen.');
 const auto={};for(const field of Object.keys(keys)){const matches=columns.map((x,i)=>keys[field].includes(key(x))?i:-1).filter(i=>i>=0);auto[field]=matches.length===1?matches[0]:-1}
 if(options.mapping!==undefined&&(!options.mapping||typeof options.mapping!=='object'||Array.isArray(options.mapping)||Object.keys(options.mapping).some(k=>!Object.hasOwn(keys,k))))menuFail('CSV-Spaltenzuordnung prüfen.');
 const mapping={...auto,...options.mapping};for(const field of Object.keys(keys)){const n=mapping[field]??-1;if(!Number.isInteger(n)||n< -1||n>=columns.length)menuFail('Ungültige CSV-Spaltenzuordnung.')}
 const assigned=Object.values(mapping).filter(n=>n>=0);if(new Set(assigned).size!==assigned.length)menuFail('Eine CSV-Spalte darf nur einmal zugeordnet sein.');
 const priceUnit=options.priceUnit||(/cent/i.test(columns[mapping.price]||'')?'cents':'euros');if(!['cents','euros'].includes(priceUnit))menuFail('Preiseinheit prüfen.');
 const rows=data.map((r,i)=>{const val=f=>(r[mapping[f]]||'').trim(),raw=val('price').replace(/\s*(?:€|EUR)$/i,'').trim();let price=null;if(priceUnit==='cents'){if(/^\d{1,9}$/.test(raw))price=Number(raw)}else if(/^\d{1,7}(?:[,.]\d{1,2})?$/.test(raw))price=Math.round(Number(raw.replace(',','.'))*100);if(price>100000000)price=null;
 const taxText=val('tax').replace(/\s*%$/,'').trim(),tax=/^(0|7|19)(?:[,.]0+)?$/.test(taxText)?Number(taxText.replace(',','.')):null,name=val('name'),category=val('category');
 return {name,category,price_cents:price,tax_rate:tax,selected:Boolean(name)&&price!==null,source:'CSV-Zeile '+(i+(header?2:1))+': '+r.join(' | ').slice(0,450),warning:!name||!category||price===null||tax===null?'Spaltenzuordnung und fehlende/unklare Angaben prüfen.':'CSV-Angaben vor Übernahme mit der Vorlage prüfen.'}});
 return {text,rows,csv:{columns:columns.map(x=>x.slice(0,160)),mapping:{...auto,...options.mapping},separator,header,priceUnit,sample:data[0].map(x=>x.slice(0,100))},warnings:[...(mapping.name<0||mapping.price<0?['Artikelname und Preis bitte den richtigen Spalten zuordnen.']:[]),...(rows.some(r=>r.price_cents===null)?['Unklare Preise, Tausendertrennzeichen und Formeln bitte korrigieren.']:[])],notice:'CSV eingelesen. Spalten, Preiseinheit und Vorschläge prüfen. Noch nichts übernommen.'};
}
