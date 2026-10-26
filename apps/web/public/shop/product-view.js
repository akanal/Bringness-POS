import {mountListingShare} from './listing-share.js';
import {products,money} from './catalog.js';
const node=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;};
const button=(text,fn,cls='outline')=>{const e=node('button',text,cls);e.type='button';e.addEventListener('click',fn);return e;};
export function catalogAmounts(product){
 if(product.netCents===null)return null;
 const vatCents=Math.round(product.netCents*19/100);
 return {netCents:product.netCents,vatCents,grossCents:product.netCents+vatCents};
}
export function alternatives(product){
 return products.filter(p=>p.id!==product.id&&p.id.startsWith('pos-')&&product.id.startsWith('pos-'));
}
export function mountProductView({product:p,host,onAdd,onSave,isSaved,onCompare,isCompared,onRelated,permalink}){
 host.replaceChildren();
 const crumbs=node('nav',undefined,'product-breadcrumbs');crumbs.setAttribute('aria-label','Produktpfad');
 crumbs.append(node('span','Sortiment'),node('span',' / '+p.category+' / '+p.name));host.append(crumbs);
 const layout=node('div',undefined,'product-detail-layout'),art=node('div',undefined,'detail-art');
 art.setAttribute('aria-hidden','true');art.append(node('span','bringness'),node('strong',p.id==='pos-online'?'POS\nOnline':p.id==='pos-download'?'POS\nWindows':'AI'),node('span','Software für deinen Betrieb'));
 const info=node('section',undefined,'product-overview'),title=node('h2',p.name);title.id='detail-title';
 info.append(node('p',p.tag,'eyebrow'),title);mountListingShare({product:p,host:info});info.append(node('p',p.description));
 const features=node('ul',undefined,'product-feature-list');p.features.forEach(text=>features.append(node('li',text)));info.append(features);
 const tabs=node('nav',undefined,'product-section-nav');tabs.setAttribute('aria-label','Produktabschnitte');
 for(const [id,label]of [['facts','Produktmerkmale'],['questions','Fragen & Antworten']])tabs.append(button(label,()=>host.querySelector('#detail-'+id)?.scrollIntoView?.({behavior:'smooth',block:'start'})));
 info.append(tabs);
 const purchase=node('aside',undefined,'product-purchase');purchase.setAttribute('aria-label','Preis und Auswahl');
 const amounts=catalogAmounts(p),period=p.period==='monthly'?'pro Monat':p.period==='once'?'einmalig':'';
 purchase.append(node('p','KATALOGPREIS','eyebrow'),node('p',amounts?money(amounts.netCents):'Preis folgt','purchase-price'));
 if(amounts)purchase.append(node('p',`netto ${period}`),node('p',`${money(amounts.vatCents)} MwSt. · ${money(amounts.grossCents)} brutto ${period}`,'muted'));
 purchase.append(node('p',amounts?'Shop-Vorschau · Zahlung noch gesperrt':'Noch nicht bestellbar','availability'),node('p',p.notice,'muted'));
 if(amounts)purchase.append(button('In den Warenkorb',()=>onAdd(p.id),'button action-primary'));
 const save=button(isSaved(p.id)?'Von Merkliste entfernen':'Auf Merkliste',()=>{onSave(p.id);save.textContent=isSaved(p.id)?'Von Merkliste entfernen':'Auf Merkliste';save.setAttribute('aria-pressed',String(isSaved(p.id)));});save.setAttribute('aria-pressed',String(isSaved(p.id)));purchase.append(save);
 const compare=button(isCompared(p.id)?'Aus Vergleich entfernen':'Vergleichen',()=>{onCompare(p.id);compare.textContent=isCompared(p.id)?'Aus Vergleich entfernen':'Vergleichen';compare.setAttribute('aria-pressed',String(isCompared(p.id)));});compare.setAttribute('aria-pressed',String(isCompared(p.id)));purchase.append(compare);
 const link=node('a','Direkter Produktlink','product-permalink');link.href=permalink;purchase.append(link);
 layout.append(art,info,purchase);host.append(layout);
 const facts=node('section',undefined,'product-facts');facts.id='detail-facts';facts.append(node('h3','Produktmerkmale'));
 const dl=node('dl');for(const [label,value]of [['Anwendung',p.name],['Kategorie',p.category],['Bereitstellung',p.id==='pos-online'?'Im Browser':p.id==='pos-download'?'Windows-Download':'Eigenständige Anwendung'],['Abrechnung',p.period==='monthly'?'Monatlich':p.period==='once'?'Einmalige Basislizenz':'Noch nicht festgelegt'],['Erweiterungen',p.id.startsWith('pos-')?'Optionale Module separat':'Produktdetails folgen']]){dl.append(node('dt',label),node('dd',value));}facts.append(dl);host.append(facts);
 const faq=node('section',undefined,'product-questions');faq.id='detail-questions';faq.append(node('h3','Fragen & Antworten'));
 const questions=[['Kann ich dieses Angebot schon bezahlen?','Die Shop-Zahlung ist noch nicht freigeschaltet. Der Warenkorb und gespeicherte Entwürfe lösen keine Zahlung aus.'],['Welcher Preis gilt für mein Kundenkonto?',amounts?'Hier stehen unverbindliche Katalogpreise. Vereinbarte Kontopreise werden in der Bestellprüfung vom Server abgerufen.':'Der endgültige Preis ist noch nicht festgelegt.'],['Was muss ich vor dem Einsatz beachten?',p.notice]];
 if(p.id.startsWith('pos-'))questions.push(['Sind Zusatzmodule im Basispreis enthalten?','Optionale Module werden separat gebucht. Online und Windows sind alternative Basislizenzen; pro Betrieb ist eine Basislizenz vorgesehen.']);
 for(const [q,a]of questions){const entry=node('details');entry.append(node('summary',q),node('p',a));faq.append(entry);}host.append(faq);
 const related=alternatives(p);if(related.length){const section=node('section',undefined,'product-alternatives');section.append(node('h3','Alternative Basislizenz'),node('p','Vergleiche die Bereitstellung und Abrechnung. Diese Angebote sind Alternativen für denselben Betrieb.','muted'));for(const item of related)section.append(button(item.name,()=>onRelated(item)));host.append(section);}
}
