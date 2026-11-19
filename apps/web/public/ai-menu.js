const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const euro=c=>c===null?'Preis offen':(c/100).toLocaleString('de-DE',{style:'currency',currency:'EUR'});
export async function renderMenu({api,root,active}){
 const shell=document.createElement('section');root.replaceChildren(shell);let generation=0;
 const valid=()=>active()&&shell.isConnected;
 const locations=(await api('locations')).locations;if(!valid())return;
 shell.innerHTML='<h1>Speisekartenassistenz</h1><p>Entwürfe gestalten, prüfen und ausdrücklich freigeben. Die freigegebene AI-Karte ändert keine POS-Artikel oder Rezepturen.</p><label>Standort <select id="menu-location"><option value="">Bitte wählen</option>'+locations.map(l=>'<option value="'+esc(l.id)+'">'+esc(l.name)+'</option>').join('')+'</select></label><div data-menu-panel></div>';
 const select=shell.querySelector('select'),panel=shell.querySelector('[data-menu-panel]');
 async function load(){const seq=++generation,locationId=select.value;panel.replaceChildren();if(!locationId)return;
  try{const d=await api('menu?locationId='+encodeURIComponent(locationId));if(!valid()||seq!==generation)return;
   const current=()=>valid()&&seq===generation&&select.value===locationId;
   panel.innerHTML='<form data-menu-settings class="card"><h2>Zugriff</h2>'+[['enabled','Assistenz und Zugriff auf Rezepte einschalten'],['readCosts','Bestätigte Einkaufspreise verwenden'],['readStock','Freie Warenbestände verwenden']].map(([k,label])=>'<label class="checkbox-label"><input type="checkbox" name="'+k+'" '+(d.settings[k]?'checked':'')+'>'+label+'</label>').join('')+'<p>Ausschalten stoppt neue Entwürfe und Freigaben. Gespeicherte Karten bleiben erhalten.</p><button>Zugriff speichern</button></form><div role="status" data-menu-message></div><div data-menu-editor></div><section class="card"><h2>Freigegebene AI-Karte</h2><div data-menu-card></div></section><section data-menu-drafts></section>';
   const message=panel.querySelector('[data-menu-message]'),editor=panel.querySelector('[data-menu-editor]');
   const run=async(form,fn)=>{if(!current())return;const buttons=[...form.querySelectorAll('button')];buttons.forEach(b=>b.disabled=true);try{await fn();if(current())await load();}catch(e){if(current()){message.textContent=e.message+' Bei unklarer Speicherantwort den aktuellen Stand neu laden.';buttons.forEach(b=>b.disabled=false);}}};
   const settings=panel.querySelector('form');settings.onsubmit=e=>{e.preventDefault();e.stopPropagation();run(settings,()=>api('menu/settings',{locationId,version:d.settings.version,...Object.fromEntries(['enabled','readCosts','readStock'].map(k=>[k,settings.elements.namedItem(k).checked]))}));};
   const card=panel.querySelector('[data-menu-card]');
   function showCard(target,content){target.innerHTML='<h3>'+esc(content.title)+'</h3>'+content.items.filter(i=>i.visible).map(i=>'<article><h4>'+esc(i.category?i.category+' · ':'')+esc(i.name)+' — '+esc(euro(i.priceCents))+'</h4><p>'+esc(i.description)+'</p></article>').join('');}
   if(d.card)showCard(card,d.card.content);else card.textContent='Noch keine Karte freigegeben.';
   if(d.settings.enabled){
    editor.innerHTML='<button type="button" data-menu-create>Kartenentwurf gestalten</button><div data-menu-form></div><h2>Kalkulations- und Bestandshinweise</h2>'+d.suggestions.map(s=>'<article class="card"><strong>'+esc(s.name)+'</strong>'+s.notes.map(n=>'<p>'+esc(n)+'</p>').join('')+'</article>').join('');
    const edit=content=>{const host=editor.querySelector('[data-menu-form]');host.innerHTML='<form class="card"><h2>Neuer Entwurf</h2><label>Titel <input name="title" required maxlength="150" value="'+esc(content.title)+'"></label>'+content.items.map((i,n)=>'<fieldset><legend>'+esc(i.name)+'</legend><label><input type="checkbox" name="include-'+n+'" checked>In Entwurf aufnehmen</label><label>Name <input name="name-'+n+'" maxlength="150" required value="'+esc(i.name)+'"></label><label>Kategorie <input name="category-'+n+'" maxlength="80" value="'+esc(i.category)+'"></label><label>Beschreibung <textarea name="description-'+n+'" maxlength="600">'+esc(i.description)+'</textarea></label><label>Bruttopreis (€) <input name="price-'+n+'" type="number" min="0" max="100000" step="0.01" value="'+(i.priceCents===null?'':i.priceCents/100)+'"></label><label><input type="checkbox" name="visible-'+n+'" '+(i.visible?'checked':'')+'>Auf Karte sichtbar</label></fieldset>').join('')+'<p>Zutaten, Allergene und Steuerangaben werden nicht geraten. Beschreibungen vor Freigabe prüfen.</p><button>Nur als Entwurf speichern</button></form>';
     const f=host.querySelector('form'),draftId=crypto.randomUUID();f.onsubmit=e=>{e.preventDefault();e.stopPropagation();const val=name=>f.elements.namedItem(name).value;run(f,()=>api('menu/draft',{id:draftId,locationId,settingsVersion:d.settings.version,baseRevision:d.card?.revision||0,content:{title:val('title'),items:content.items.flatMap((i,n)=>f.elements.namedItem('include-'+n).checked?[{recipeId:i.recipeId,name:val('name-'+n),category:val('category-'+n),description:val('description-'+n),priceCents:val('price-'+n)===''?null:Math.round(Number(val('price-'+n))*100),visible:f.elements.namedItem('visible-'+n).checked}]:[])}}));};
    };
    editor.querySelector('[data-menu-create]').onclick=()=>edit(d.card?.content||{title:'Unsere Speisekarte',items:d.recipes.slice(0,100).map(r=>({recipeId:r.id,name:r.name,category:'',description:'',priceCents:null,visible:r.active}))});
    editor.edit=edit;
   }
   const drafts=panel.querySelector('[data-menu-drafts]');drafts.innerHTML='<h2>Letzte 50 Entwürfe und Entscheidungen</h2>';
   for(const draft of d.drafts){const article=document.createElement('article');article.className='card';const preview=document.createElement('div');showCard(preview,draft.content);article.append(preview);const status=document.createElement('p');status.textContent=({draft:'Entwurf — noch nicht übernommen',approved:'Freigegeben',rejected:'Abgelehnt'})[draft.state];article.append(status);
    if(draft.state==='draft'&&d.settings.enabled){const editButton=document.createElement('button');editButton.type='button';editButton.textContent='Als neuen Entwurf bearbeiten';editButton.onclick=()=>editor.edit(draft.content);article.append(editButton);
     const f=document.createElement('form');f.innerHTML='<label class="checkbox-label"><input name="confirmed" type="checkbox" required>Ich habe alle sichtbaren Gerichte, Beschreibungen und Bruttopreise geprüft. Nur diese AI-Kartenfassung wird übernommen.</label><button name="decision" value="approve">Geprüfte AI-Karte freigeben</button><button name="decision" value="reject">Entwurf ablehnen</button>';f.onsubmit=e=>{e.preventDefault();e.stopPropagation();const decision=e.submitter?.value;if(!decision)return;run(f,()=>api('menu/decide',{locationId,id:draft.id,version:draft.version,decision,confirmed:f.elements.namedItem('confirmed').checked}));};article.append(f);
    }drafts.append(article);
   }
  }catch(e){if(valid()&&seq===generation)panel.textContent=e.message;}
 }
 select.onchange=load;
 if(locations.length===1){select.value=locations[0].id;await load();}
}
