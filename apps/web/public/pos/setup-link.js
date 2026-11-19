(()=>{const q=new URLSearchParams(location.search);if(document.documentElement.dataset.bringnessEdition==='download'||q.get('desktop')==='1'||q.get('edition')==='download'||window.offlinePOS)return;

 if(q.get('einrichtung')==='1'){
  const auth=document.getElementById('auth');
  const authHint=document.createElement('p');
  authHint.textContent='Melde dich an, um den Einrichtungsbogen für deinen Betrieb zu öffnen.';
  auth?.prepend(authHint);
  const select=document.getElementById('restaurant');
  const workspace=document.getElementById('workspace');
  if(select&&workspace){
   const entry=document.createElement('a');
   entry.className='setup-entry-link';
   entry.textContent='Einrichtungsbogen für ausgewählten Betrieb öffnen';
   entry.hidden=true;
   select.parentElement.append(entry);
   const update=()=>{
    entry.hidden=!select.value||!workspace.classList.contains('show');
    if(entry.hidden)entry.removeAttribute('href');
    else entry.href='/pos/setup.html?restaurantId='+encodeURIComponent(select.value);
   };
   select.addEventListener('change',update);
   new MutationObserver(update).observe(select,{childList:true,subtree:true});
   new MutationObserver(update).observe(workspace,{attributes:true,attributeFilter:['class']});
   update();
  }
 }
 function mount(){if(document.body.dataset.posView!=='einstellungen')return;const host=document.getElementById('moduleBody');if(!host||!host.querySelector('#posSettingsOperations')||host.querySelector('[data-setup-link]'))return;const card=document.createElement('div');card.className='modulecard';card.dataset.setupLink='true';const title=document.createElement('h3');title.textContent='Betrieb einrichten';const text=document.createElement('p');text.textContent='Schritt für Schritt weiter – dein Fortschritt bleibt je Betrieb gespeichert.';const a=document.createElement('a');a.textContent='Einrichtungsassistent öffnen';a.target='_blank';a.rel='noopener';a.href='/pos/setup.html?restaurantId='+encodeURIComponent(document.getElementById('restaurant')?.value||'');card.append(title,text,a);host.prepend(card)}
 let opening=false;async function open(){if(opening||!q.has('setupView')||!document.getElementById('workspace')?.classList.contains('show'))return;const view=q.get('setupView'),rid=q.get('setupRestaurant'),select=document.getElementById('restaurant');if(!['einstellungen','lizenz','artikel','displays','tse'].includes(view)||!select||!Array.from(select.options).some(o=>o.value===rid)||typeof window.showModule!=='function')return;opening=true;try{if(select.value!==rid){select.value=rid;select.dispatchEvent(new Event('change',{bubbles:true}))}await window.showModule(view);const u=new URL(location.href);u.searchParams.delete('setupView');u.searchParams.delete('setupRestaurant');history.replaceState(null,'',u)}finally{q.delete('setupView');opening=false}}
 new MutationObserver(()=>{mount();open().catch(()=>{})}).observe(document.body,{childList:true,subtree:true});mount();open().catch(()=>{});
})();
