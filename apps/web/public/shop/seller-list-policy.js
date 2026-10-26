import {categories,categoryMatches} from './departments.js';
const invalid=()=>{throw Object.assign(Error('INVALID_REQUEST'),{code:'INVALID_REQUEST'});};
export function sellerListFilters(value={}){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!['query','state','category','kind','stock'].includes(k)))invalid();
 const {query='',state='draft',category='Alle',kind='all',stock='all'}=value;
 if(typeof query!=='string'||query.length>120||!['draft','archived'].includes(state)||!categories.includes(category)||!['all','physical','digital','service'].includes(kind)||!['all','available','empty'].includes(stock))invalid();
 const normalized=query.trim().replace(/\s+/gu,' ');if(normalized&&normalized.split(' ').length>15)invalid();
 return {query:normalized,state,category,kind,stock};
}
export function structuredSellerMatch(offer,filters){return categoryMatches(offer.category,filters.category)&&(filters.kind==='all'||offer.kind===filters.kind)&&(filters.stock==='all'||offer.kind==='physical'&&(filters.stock==='empty'?Number(offer.stock)===0:Number(offer.stock)>0));}
