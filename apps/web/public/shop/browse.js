import {searchMatch,priceMatches,locationMatches,publicationTime} from './discovery-policy.js';
import {listingQuery} from './listing-reference.js';
import {products,filterProducts} from './catalog.js?v=categories-20261026';
export function browseProducts({query='',category='Alle',period='all',priced=false,sort='default',minPrice='',maxPrice='',city='',origin=null,radius=25}={}){
 if(listingQuery(query))return filterProducts(query);
 let matching=filterProducts(query,category);
 if(!matching.length&&query.trim()&&!/\d/.test(query))matching=filterProducts('',category).filter(p=>searchMatch(p,query,{fuzzy:true}));
 const list=matching.filter(p=>(period==='all'||(period==='unknown'?p.period===null:p.period===period))&&(!priced||p.netCents!==null)&&priceMatches(p,minPrice,maxPrice)&&locationMatches(p,city,origin,radius));
 if(sort==='newest')list.sort((a,b)=>(publicationTime(b)??-Infinity)-(publicationTime(a)??-Infinity)||0);
 if(sort==='name')list.sort((a,b)=>a.name.localeCompare(b.name,'de'));
 if(['price-asc','price-desc'].includes(sort)){
  // Monthly and one-time prices are not comparable contract totals.
  const rank=p=>p.period==='monthly'?0:p.period==='once'?1:2;
  list.sort((a,b)=>rank(a)-rank(b)||(sort==='price-asc'?1:-1)*((a.netCents??Infinity)-(b.netCents??Infinity))||a.name.localeCompare(b.name,'de'));
 }
 return list;
}
export function cleanProductIds(value,max=products.length){
 if(!Array.isArray(value))return [];
 return [...new Set(value.filter(id=>typeof id==='string'&&products.some(p=>p.id===id)))].slice(0,max);
}
export function readProductIds(storage,key){try{return cleanProductIds(JSON.parse(storage.getItem(key)||'[]'));}catch{return [];}}
export function writeProductIds(storage,key,ids){try{storage.setItem(key,JSON.stringify(cleanProductIds(ids)));return true;}catch{return false;}}
