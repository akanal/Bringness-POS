import {businessSectors} from '/business-sectors.js';
import {renderAdvertisements} from './advertising-view.js';
const categories=document.querySelector('.shop-categories');
if(categories){
  const icons=categories.querySelector('.category-icons');icons.replaceChildren();
  for(const sector of businessSectors){
    // Non-restaurant discovery is not available yet. Never imply ordering is enabled.
    const choice=document.createElement(sector.id==='restaurant'?'a':'div');
    choice.className='category-choice'+(sector.id==='restaurant'?'':' soon');
    if(sector.id==='restaurant')choice.href='#results-heading';
    const figure=document.createElement('span');figure.className='category-figure';figure.setAttribute('aria-hidden','true');figure.textContent=sector.icon;
    const face=document.createElement('i');face.textContent='☺';figure.append(face);
    const label=document.createElement('strong');label.textContent=sector.label;
    const detail=document.createElement('small');detail.textContent=sector.id==='restaurant'?'Restaurants entdecken':'Demnächst';
    choice.append(figure,label,detail);icons.append(choice);
  }
}
const layout=document.querySelector('.result-layout');
if(layout){
  // Remove old example tiles, which have no connection to the central admin.
  layout.querySelectorAll('.campaign-rail').forEach(node=>node.remove());
  const rail=document.createElement('aside');rail.className='portal-advertising';rail.setAttribute('aria-label','Werbung');rail.hidden=true;layout.append(rail);
  async function refresh(){
    try{const response=await fetch('/api/v1/delivery-portal/advertising',{cache:'no-store'});if(!response.ok)throw Error('Unavailable');const data=await response.json();renderAdvertisements(rail,data.advertisements||[]);}
    catch{rail.replaceChildren();rail.hidden=true;}
  }
  void refresh();
  // Paused or expired advertising is removed from already open pages as well.
  setInterval(()=>{if(!document.hidden)void refresh();},60000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refresh();});
}
