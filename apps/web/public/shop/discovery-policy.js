// Pure public-catalog helpers. Unknown metadata never becomes an invented fact.
export const normalizeSearch=(value,max=150)=>String(value??'').slice(0,max).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('de-DE').replace(/ß/g,'ss').trim();
export function oneEdit(a,b){
 if(Math.abs(a.length-b.length)>1)return false;
 if(a===b)return true;
 if(a.length===b.length){const at=[...a].findIndex((v,i)=>v!==b[i]);return a.slice(at+1)===b.slice(at+1)||(a[at]===b[at+1]&&a[at+1]===b[at]&&a.slice(at+2)===b.slice(at+2));}
 if(a.length>b.length)[a,b]=[b,a];let i=0;while(i<a.length&&a[i]===b[i])i++;return a.slice(i)===b.slice(i+1);
}
export function searchMatch(product,query,{fuzzy=false}={}){
 const words=normalizeSearch(query).split(/\s+/).filter(Boolean),text=normalizeSearch([product.name,product.description,product.category,product.tag,...(Array.isArray(product.features)?product.features:[])].join(' '),4096),tokens=text.split(/[^a-z0-9]+/).filter(Boolean);
 return words.every(word=>text.includes(word)||(fuzzy&&word.length>=4&&!/\d/.test(word)&&tokens.some(token=>oneEdit(word,token))));
}
export function priceBound(value){
 if(value===undefined||value===null||value==='')return null;
 if(typeof value!=='string'||!/^\d{1,8}([.,]\d{1,2})?$/.test(value))return NaN;
 return Math.round(Number(value.replace(',','.'))*100);
}
export function priceMatches(product,min='',max=''){
 const a=priceBound(min),b=priceBound(max);if(Number.isNaN(a)||Number.isNaN(b)||(a!==null&&b!==null&&a>b))return false;
 if(a===null&&b===null)return true;
 return Number.isSafeInteger(product.netCents)&&(a===null||product.netCents>=a)&&(b===null||product.netCents<=b);
}
export function searchSuggestions(list,query){
 const q=normalizeSearch(query);if(!q)return list.slice(0,6);
 // Number/code queries stay exact: never suggest an unrelated numbered advertisement.
 if(/\d/.test(q))return list.filter(p=>p.listingNumber===q).slice(0,6);
 return list.filter(p=>searchMatch(p,q,{fuzzy:true})).slice(0,6);
}
export function relatedProducts(list,product){return list.filter(p=>p.id!==product.id&&p.category===product.category).slice(0,4);}
export function distanceKm(a,b){
 const valid=p=>p&&Number.isFinite(p.lat)&&Math.abs(p.lat)<=90&&Number.isFinite(p.lon)&&Math.abs(p.lon)<=180;
 if(!valid(a)||!valid(b))return null;
 const rad=x=>x*Math.PI/180,dlat=rad(b.lat-a.lat),dlon=rad(b.lon-a.lon),h=Math.sin(dlat/2)**2+Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(dlon/2)**2;
 return 6371*2*Math.asin(Math.sqrt(Math.min(1,h)));
}
export function locationMatches(product,city='',origin=null,radius=25){
 if(city&&!normalizeSearch(product.location?.city).includes(normalizeSearch(city)))return false;
 if(origin){const distance=distanceKm(origin,product.location);return distance!==null&&Number.isFinite(radius)&&radius>0&&radius<=500&&distance<=radius;}
 return true;
}
export function publicationTime(product){const value=Date.parse(product.publishedAt);return Number.isFinite(value)?value:null;}
