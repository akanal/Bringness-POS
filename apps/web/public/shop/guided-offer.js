export function mountGuidedOffer({window}){
 const d=window.document,host=d.getElementById('guided-start');if(!host)return;
 const panel=d.createElement('div');panel.id='guided-offer-content';while(host.firstChild)panel.append(host.firstChild);
 const toggle=d.createElement('button');toggle.type='button';toggle.className='guided-offer-toggle';toggle.id='guided-offer-toggle';toggle.setAttribute('aria-controls',panel.id);toggle.setAttribute('aria-expanded','true');toggle.textContent='Hilfe ausblenden';
 toggle.addEventListener('click',()=>{const collapsed=!panel.hidden;panel.hidden=collapsed;host.classList.toggle('guided-offer-collapsed',collapsed);toggle.setAttribute('aria-expanded',String(!collapsed));toggle.textContent=collapsed?'Schritt-für-Schritt-Hilfe anzeigen':'Hilfe ausblenden';});host.append(toggle,panel);
 let index=0;
 const steps=()=>[
  {title:'Was möchtest du anbieten?',text:'Wähle Ware, digitales Produkt oder Dienstleistung. Gib einen klaren Titel und eine passende Kategorie ein.',target:'offer-title',action:'Zu Titel und Kategorie'},
  {title:'Beschreibe dein Angebot',text:'Nenne bekannte Merkmale, Zustand und Lieferumfang. Erfinde keine Eigenschaften. Artikelnummer und EAN sind freiwillig.',target:'offer-description',action:'Zur Beschreibung'},
  {title:'Lege Preis und Steuer fest',text:'Trage den Nettopreis ein und prüfe den passenden Umsatzsteuersatz. Die Preisvorschau hilft beim Vergleich; sie ersetzt keine steuerliche Prüfung.',target:'offer-price',action:'Zu Preis und Steuer'},
  d.getElementById('offer-kind')?.value==='physical'
   ?{title:'Bestand und Lieferung erklären',text:'Wie viele Stück sind verfügbar? Beschreibe Versand oder Abholung, Kosten und voraussichtliche Lieferzeit. Varianten und die öffentliche Lieferauswahl prüfst du vor der Veröffentlichung separat.',target:'offer-stock',action:'Zu Bestand und Lieferung'}
   :{title:'Bereitstellung erklären',text:'Beschreibe, wie und wann das digitale Produkt oder die Dienstleistung bereitgestellt wird. Der öffentliche Händler-Warenbereich unterstützt derzeit nur physische Waren; dieser Entwurf bleibt privat.',target:'offer-fulfilment',action:'Zur Bereitstellung'},
  {title:'Prüfen, speichern und veröffentlichen',text:'Prüfe den Entwurf im Editor. „In diesem Tab speichern“ ist nur lokal; „Im Betriebskonto speichern“ legt ihn dauerhaft im angemeldeten Konto ab. Das veröffentlicht noch nichts. Physische Waren kannst du danach im Händlerbereich mit bestätigter Händlerfreigabe ausdrücklich veröffentlichen.',target:'check-offer',action:'Zur Entwurfsprüfung'}
 ];
 const status=d.getElementById('guided-offer-status'),title=d.getElementById('guided-offer-title'),copy=d.getElementById('guided-offer-copy'),prev=d.getElementById('guided-offer-prev'),next=d.getElementById('guided-offer-next'),action=d.getElementById('guided-offer-field'),nav=d.getElementById('guided-offer-nav');
 const render=()=>{const step=steps()[index];status.textContent='Schritt '+(index+1)+' von 5';title.textContent=step.title;copy.textContent=step.text;prev.disabled=index===0;next.disabled=index===4;action.textContent=step.action;for(const [i,button]of [...nav.querySelectorAll('button')].entries()){if(i===index)button.setAttribute('aria-current','step');else button.removeAttribute('aria-current');}d.getElementById('guided-offer-publish').hidden=index!==4;};
 const select=i=>{index=i;render();title.focus({preventScroll:true});};
 for(const [i,label]of ['Angebotsart','Beschreibung','Preis','Bereitstellung','Prüfen & speichern'].entries()){const b=d.createElement('button');b.type='button';b.textContent=(i+1)+'. '+label;b.addEventListener('click',()=>select(i));nav.append(b);}
 prev.addEventListener('click',()=>select(Math.max(0,index-1)));next.addEventListener('click',()=>select(Math.min(4,index+1)));
 action.addEventListener('click',()=>{const target=d.getElementById(steps()[index].target);if(!target||target.disabled||target.closest('[hidden]')){status.textContent='Der Editor ist gerade nicht verfügbar. Prüfe zuerst den angezeigten Kontozugang oder Bearbeitungshinweis.';return;}target.scrollIntoView?.({block:'center',behavior:window.matchMedia?.('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});target.focus({preventScroll:true});});
 d.getElementById('offer-kind')?.addEventListener('change',render);render();
}
if(typeof window!=='undefined')mountGuidedOffer({window});
