import {offerId} from './offer-policy.js';
import {marketGross,marketMoney} from './market-policy.js';
export function publicOfferCard(p){
 if(!p||!offerId(p.id)||typeof p.title!=='string'||!p.title.trim()||p.title.length>120||!p.seller||typeof p.seller.name!=='string'||!Array.isArray(p.variants)||!p.variants.length||p.variants.length>20)throw Error('Invalid public offer');
 const variants=p.variants.filter(v=>Number.isSafeInteger(v.stock)&&v.stock>0&&Number.isSafeInteger(v.netCents)&&v.netCents>0&&v.netCents<=100000000&&[0,700,1900].includes(v.vatBasisPoints));if(!variants.length)return null;
 const prices=variants.map(v=>marketGross(v.netCents,v.vatBasisPoints)),price=Math.min(...prices);let shipping=null;
 if(p.shipping){if(!Number.isSafeInteger(p.shippingNetCents)||p.shippingNetCents<0||p.shippingNetCents>100000000||![0,700,1900].includes(p.shippingVatBasisPoints))throw Error('Invalid public shipping');shipping=marketGross(p.shippingNetCents,p.shippingVatBasisPoints);}
 return {id:p.id,title:p.title,seller:p.seller.name,priceCents:price,priceLabel:(new Set(prices).size>1?'Ab ':'')+marketMoney(price)+' inkl. MwSt.',shippingLabel:p.shipping?(shipping===0?'Versandkostenfrei':'+ '+marketMoney(shipping)+' Versand je Händlerbestellung'):'Nur Abholung',delivery:p.shipping?String(p.delivery||'Lieferzeit beim Händler erfragen'):String(p.pickupAddress||'Abholort beim Händler erfragen'),stockLabel:variants.length===1?variants[0].stock+' verfügbar':'Verfügbare Varianten',imageUrl:typeof p.imageUrl==='string'&&/^\/api\/v1\/shop\/marketplace\/images\/public\/[a-f0-9-]{36}$/i.test(p.imageUrl)?p.imageUrl:null};
}
export async function mountOfferDiscovery({window:w,document:d=w.document,fetchImpl=w.fetch.bind(w)}){
 const host=d.getElementById('home-market-offers'),list=d.getElementById('home-market-offer-list');if(!host||!list)return;
 const resume=e=>{if(e.persisted){w.removeEventListener('pageshow',resume);mountOfferDiscovery({window:w,document:d,fetchImpl});}};w.addEventListener('pageshow',resume);
 const controller=new w.AbortController(),timer=w.setTimeout(()=>controller.abort(),10000);const hide=()=>{controller.abort();host.hidden=true;list.replaceChildren();};w.addEventListener('pagehide',hide,{once:true});
 try{const r=await fetchImpl('/api/v1/shop/marketplace?available=1',{credentials:'omit',redirect:'error',cache:'no-store',referrerPolicy:'no-referrer',signal:controller.signal});if(!r.ok)return;const data=await r.json();if(!Array.isArray(data.offers)||data.offers.length>25)return;const cards=data.offers.map(publicOfferCard).filter(Boolean).slice(0,6);if(controller.signal.aborted||!cards.length)return;
 const nodes=cards.map(card=>{const a=d.createElement('a');a.className='public-offer-card';a.href='/shop/marketplace.html?offer='+encodeURIComponent(card.id);if(card.imageUrl){const image=d.createElement('img');image.src=card.imageUrl;image.alt=card.title;image.loading='lazy';image.width=240;image.height=180;a.append(image);}for(const [tag,text]of [['h3',card.title],['p','Verkauft von '+card.seller],['strong',card.priceLabel],['p',card.shippingLabel],['p',card.delivery],['small',card.stockLabel]]){const e=d.createElement(tag);e.textContent=text;a.append(e);}return a;});list.replaceChildren(...nodes);host.hidden=false;
 }catch{host.hidden=true;list.replaceChildren();}finally{w.clearTimeout(timer);}
}
if(typeof window!=='undefined')mountOfferDiscovery({window});
