import {listingLink,listingNumber} from './listing-reference.js';
export function mountListingShare({product,host,window:w=host.ownerDocument.defaultView}){
 const d=host.ownerDocument,number=listingNumber(product.listingNumber);if(!number)return;
 const url=listingLink(product,w.location.href),row=d.createElement('div');row.className='listing-reference';
 const label=d.createElement('small');label.className='listing-number';label.textContent='Anzeige '+number;
 const button=d.createElement('button');button.type='button';button.className='listing-share';button.title='Anzeige teilen';button.setAttribute('aria-label','Anzeige teilen · '+product.name);button.dataset.product=product.id;button.dataset.action='share';
 const svg=d.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');svg.setAttribute('focusable','false');
 const path=d.createElementNS(svg.namespaceURI,'path');path.setAttribute('d','M8 10l8-5M8 14l8 5');svg.append(path);for(const [x,y]of [[5,12],[19,3],[19,21]]){const circle=d.createElementNS(svg.namespaceURI,'circle');circle.setAttribute('cx',x);circle.setAttribute('cy',y);circle.setAttribute('r','2');svg.append(circle);}button.append(svg);
 const status=d.createElement('span');status.className='listing-share-status';status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 const manual=d.createElement('input');manual.type='text';manual.className='listing-share-link';manual.readOnly=true;manual.hidden=true;manual.value=url;manual.setAttribute('aria-label','Direkter Link zu Anzeige '+number);manual.addEventListener('focus',()=>manual.select());
 const fallback=()=>{manual.hidden=false;status.textContent='Link auswählen und kopieren.';manual.focus();manual.select();};
 let busy=false;
 button.addEventListener('click',async()=>{if(busy)return;busy=true;button.disabled=true;status.textContent='';manual.hidden=true;
  try{if(typeof w.navigator.share==='function'){await w.navigator.share({title:product.name,text:'Anzeigennummer '+number,url});if(row.isConnected)status.textContent='An die Teilen-Funktion übergeben.';}
   else if(typeof w.navigator.clipboard?.writeText==='function'){await w.navigator.clipboard.writeText(url);if(row.isConnected)status.textContent='Link kopiert.';}
   else if(row.isConnected)fallback();
  }catch(error){if(row.isConnected){if(error?.name==='AbortError')status.textContent='Teilen abgebrochen.';else fallback();}}
  finally{busy=false;if(row.isConnected)button.disabled=false;}
 });row.append(label,button,status,manual);host.append(row);return row;
}
