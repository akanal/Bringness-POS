import {products} from './catalog.js';
import {listingLink} from './listing-reference.js';
const node=(tag,text)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e;};
// Only the current first-party catalogue has a publicly established provider.
export function publicSeller(product){return products.some(p=>p.id===product.id)?{id:'bringness',name:'Bringness',email:'info@bringness.de'}:null;}
export function mailDraft(product,{report=false,reason='',message='',href='https://bringness.de/shop/'}={}){
 if(!products.some(p=>p.id===product?.id))return null;
 const subject=(report?'Anzeigenmeldung':'Anfrage')+' · Anzeige '+product.listingNumber+' · '+product.name;
 const body=['Anzeige: '+product.listingNumber,product.name,listingLink(product,href),report?'Grund: '+String(reason).slice(0,80):'',String(message).slice(0,2000)].filter(Boolean).join('\n');
 return 'mailto:info@bringness.de?subject='+encodeURIComponent(subject)+'&body='+encodeURIComponent(body);
}
export function mountListingTools({product,host,onRelated}){
 const seller=publicSeller(product);if(!seller)return;
 const profile=node('details');profile.className='seller-profile';profile.append(node('summary','Anbieter: '+seller.name),node('p','Öffentliche Bringness-Angebote. Händlerentwürfe anderer Anbieter sind noch nicht veröffentlicht.'));
 for(const item of products){const b=node('button',item.name);b.type='button';b.onclick=()=>onRelated(item);profile.append(b);}const legal=node('a','Impressum / Anbieterangaben');legal.href='/impressum/';profile.append(legal);host.append(profile);
 const contact=node('details');contact.className='listing-contact';contact.append(node('summary','Frage zu dieser Anzeige'));
 const label=node('label','Deine Frage (maximal 2000 Zeichen)'),text=node('textarea');text.maxLength=2000;text.rows=3;label.append(text);const link=node('a','E-Mail-Entwurf öffnen');const update=()=>link.href=mailDraft(product,{message:text.value,href:window.location.href});text.addEventListener('input',update);update();contact.append(label,link,node('p','Öffnet dein E-Mail-Programm. Erst dort kannst du die Nachricht selbst senden. Es wird hier nichts versendet.'));host.append(contact);
 const report=node('details');report.className='listing-contact';report.append(node('summary','Anzeige melden'));
 const reasonLabel=node('label','Grund'),reason=node('select');for(const value of ['Falsche Angaben','Unzulässiger Inhalt','Verdacht auf Betrug','Sonstiges']){const option=node('option',value);option.value=value;reason.append(option);}reasonLabel.append(reason);
 const explanation=node('label','Erläuterung (maximal 2000 Zeichen)'),message=node('textarea');message.maxLength=2000;message.rows=3;explanation.append(message);const send=node('a','Meldung als E-Mail vorbereiten');const reportUpdate=()=>send.href=mailDraft(product,{report:true,reason:reason.value,message:message.value,href:window.location.href});reason.addEventListener('change',reportUpdate);message.addEventListener('input',reportUpdate);reportUpdate();report.append(reasonLabel,explanation,send,node('p','Die Meldung wird erst versendet, wenn du sie in deinem E-Mail-Programm abschickst. Keine automatische Löschung oder Sperrung.'));host.append(report);
}
export function publicImages(product){
 if(!Array.isArray(product.images))return [];
 return product.images.slice(0,8).filter(image=>image&&typeof image.src==='string'&&/^\/shop\/media\/[a-zA-Z0-9_-]+\.(?:png|jpe?g|webp)$/.test(image.src)&&typeof image.alt==='string'&&image.alt.length<=200);
}
export function mountGallery({product,host}){
 const images=publicImages(product);if(!images.length)return false;
 const section=node('section');section.className='product-gallery';section.setAttribute('aria-label','Produktbilder');const img=node('img'),position=node('p'),controls=node('div'),zoom=node('button','Bild vergrößern'),viewport=node('div');viewport.className='gallery-zoom';zoom.type='button';let expanded=false;viewport.append(img);zoom.onclick=()=>{expanded=!expanded;img.style.maxHeight=expanded?'none':'65vh';img.style.maxWidth=expanded?'none':'100%';zoom.textContent=expanded?'Vergrößerung schließen':'Bild vergrößern';zoom.setAttribute('aria-pressed',String(expanded));};zoom.setAttribute('aria-pressed','false');const buttons=[];
 function show(at){img.src=images[at].src;img.alt=images[at].alt;position.textContent=`Bild ${at+1} von ${images.length}`;buttons.forEach((b,i)=>b.setAttribute('aria-pressed',String(i===at)));}
 images.forEach((image,i)=>{const b=node('button',String(i+1));b.type='button';b.setAttribute('aria-label','Produktbild '+(i+1)+' anzeigen');b.onclick=()=>show(i);buttons.push(b);controls.append(b);});position.setAttribute('aria-live','polite');section.append(viewport,position,controls,zoom);host.append(section);show(0);return true;
}
