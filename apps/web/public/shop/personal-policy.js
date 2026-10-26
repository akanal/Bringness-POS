import {products} from './catalog.js';
import {readBrowseLocation,browseLocation} from './navigation.js';
export const personalKey='bringness.shop.personal.v1';
const validId=v=>typeof v==='string'&&/^[a-z0-9-]{1,80}$/.test(v);
const text=(v,max)=>typeof v==='string'?v.slice(0,max):'';
export function cleanPersonal(value){
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Ungültiger persönlicher Speicher.');
 const ids=value=>Array.isArray(value)?[...new Set(value.filter(validId))].slice(0,100):[];
 return {version:1,searches:(Array.isArray(value.searches)?value.searches:[]).slice(0,20).filter(x=>x&&typeof x.path==='string'&&x.path.startsWith('/shop/')&&x.path.length<2000).map(x=>({name:text(x.name,80),path:browseLocation('https://local.invalid/shop/',{...readBrowseLocation('https://local.invalid'+x.path),product:null})})),history:(Array.isArray(value.history)?value.history:[]).filter(x=>typeof x==='string'&&x.trim()).slice(0,20).map(x=>x.slice(0,150)),lists:(Array.isArray(value.lists)?value.lists:[]).filter(x=>x&&validId(x.id)&&typeof x.name==='string'&&x.name.trim()).slice(0,20).map(x=>({id:x.id,name:x.name.trim().slice(0,80),ids:ids(x.ids)})).filter((x,i,a)=>a.findIndex(y=>y.id===x.id)===i),notes:Object.fromEntries(Object.entries(value.notes&&typeof value.notes==='object'&&!Array.isArray(value.notes)?value.notes:{}).filter(([id,v])=>validId(id)&&typeof v==='string').slice(0,100).map(([id,v])=>[id,v.slice(0,1000)])),hidden:ids(value.hidden)};
}
export function createPersonalStore(storage){
 let state=cleanPersonal({}),blocked=false;
 try{const raw=storage.getItem(personalKey);if(raw){if(raw.length>200000)throw Error();state=cleanPersonal(JSON.parse(raw));}}catch{blocked=true;}
 return {get:()=>structuredClone(state),blocked:()=>blocked,save(value){if(blocked)return false;const next=cleanPersonal(value);try{storage.setItem(personalKey,JSON.stringify(next));state=next;return true;}catch{return false;}}};
}
export function publicSelectionLink(kind,ids,href){
 if(!['saved','compare'].includes(kind))throw Error('Ungültige Auswahl.');
 const selected=[...new Set(ids)].map(id=>products.find(p=>p.id===id)).filter(Boolean).slice(0,kind==='compare'?3:100);
 if(!selected.length)throw Error('Bitte zuerst öffentliche Angebote auswählen.');
 return new URL('/shop/#selection='+kind+'&items='+selected.map(p=>p.listingNumber).join(','),new URL(href).origin).href;
}
export function readPublicSelection(href){
 const hash=new URL(href).hash;if(!hash.startsWith('#selection='))return null;
 if(hash.length>2100)return {invalid:true};const params=new URLSearchParams(hash.slice(1)),kind=params.get('selection'),raw=params.get('items');
 if(params.getAll('selection').length!==1||params.getAll('items').length!==1||[...params.keys()].some(k=>!['selection','items'].includes(k))||!['saved','compare'].includes(kind)||!raw||!/^[1-9]\d{5,18}(,[1-9]\d{5,18})*$/.test(raw))return {invalid:true};
 const numbers=[...new Set(raw.split(','))];if(numbers.length>(kind==='compare'?3:100))return {invalid:true};
 return {kind,products:numbers.map(n=>products.find(p=>p.listingNumber===n)).filter(Boolean),unavailable:numbers.filter(n=>!products.some(p=>p.listingNumber===n)).length};
}
export function paginateProducts(items,hidden,limit=12){const visible=items.filter(p=>!hidden.includes(p.id));return {items:visible.slice(0,limit),total:visible.length,remaining:Math.max(0,visible.length-limit)};}
export function offerCsv(rows){
 if(!Array.isArray(rows)||rows.length>200)throw Error('Ungültiger Export.');
 const quote=value=>'"'+String(value??'').replace(/^[\s\u0000-\u001f]*[=+@-]/u,match=>"'"+match).replaceAll('"','""')+'"';
 const columns=['Anzeigennummer','Titel','Status','Kategorie','Art','Nettopreis EUR','MwSt.','Bestand','Artikelnummer','GTIN','Beschreibung'];
 return '\ufeff'+[columns,...rows.map(row=>{const p=row.offer||row;return [row.listingNumber||'',p.title,row.state==='archived'?'Archiv':p.workflow||'Entwurf',p.category,p.kind,p.price,p.tax,p.stock,p.sku,p.gtin,p.description];})].map(row=>row.map(quote).join(';')).join('\r\n')+'\r\n';
}
