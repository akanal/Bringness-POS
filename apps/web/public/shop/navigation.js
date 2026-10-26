import {products,validateCart} from './catalog.js';
import {categories} from './departments.js';
const periods=['all','monthly','once','unknown'];
const sorts=['default','name','price-asc','price-desc'];
export function readBrowseLocation(href){
 const u=new URL(href,'https://shop.invalid');
 const get=(key,values,fallback)=>values.includes(u.searchParams.get(key))?u.searchParams.get(key):fallback;
 return {query:(u.searchParams.get('q')||'').slice(0,150),category:get('category',categories,'Alle'),period:get('period',periods,'all'),sort:get('sort',sorts,'default'),priced:u.searchParams.get('priced')==='1',view:get('view',['grid','list'],'grid'),product:products.some(p=>p.id===u.searchParams.get('product'))?u.searchParams.get('product'):null};
}
export function browseLocation(href,state){
 const u=new URL(href,'https://shop.invalid');
 // Only public catalog state is included in shareable URLs.
 u.search='';
 if(!['','#angebote','#kategorien','#recent-section','#anbieter'].includes(u.hash))u.hash='';
 for(const [key,value,defaultValue]of [['q',String(state.query||'').slice(0,150),''],['category',state.category,'Alle'],['period',state.period,'all'],['sort',state.sort,'default'],['view',state.view,'grid'],['priced',state.priced?'1':'0','0'],['product',state.product||'','']])if(value&&value!==defaultValue)u.searchParams.set(key,value);
 const normalized=readBrowseLocation(u.href);u.search='';
 for(const [key,value,defaultValue]of [['q',normalized.query,''],['category',normalized.category,'Alle'],['period',normalized.period,'all'],['sort',normalized.sort,'default'],['view',normalized.view,'grid'],['priced',normalized.priced?'1':'0','0'],['product',normalized.product||'','']])if(value&&value!==defaultValue)u.searchParams.set(key,value);
 return u.pathname+u.search+u.hash;
}
export function cartIssues(cart){
 const valid=validateCart(cart),issues=[];
 if(Object.keys(valid).length>1)issues.push('Bitte nur eine Basislizenz auswählen: POS Online oder POS für Windows.');
 if(Object.values(valid).some(n=>n!==1))issues.push('Pro Betrieb ist nur eine Basislizenz vorgesehen. Bitte die Menge auf 1 setzen.');
 return issues;
}
export function sessionStore(browser){
 try{return browser.sessionStorage;}catch{return {getItem(){throw Error('STORAGE_UNAVAILABLE');},setItem(){throw Error('STORAGE_UNAVAILABLE');},removeItem(){throw Error('STORAGE_UNAVAILABLE');}};}
}
