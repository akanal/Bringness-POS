import {departments,rootDepartments} from './departments.js?v=categories-20261026';
const childrenOf=name=>departments.filter(item=>item.parent===name);
export const normalizeCategorySearch=value=>String(value).toLocaleLowerCase('de').replace(/ä|ae/g,'a').replace(/ö|oe/g,'o').replace(/ü|ue/g,'u').replace(/ß/g,'ss').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim();
const aliases={'Computer & Zubehör':'laptop notebook pc computer','Handyzubehör':'smartphone handy mobiltelefon','Elektro-Großgeräte':'kuehlschrank waschmaschine herd','TV, Video & Heimkino':'fernseher television tv','Fahrräder & Radsport':'fahrrad bike rad','Küche, Haushalt & Wohnen':'kueche haushalt wohnen','Drogerie & Körperpflege':'hygiene pflege','Kosmetik':'makeup schminke','Tierbedarf':'haustier tiere','Hundebedarf':'hund hunde','Katzenbedarf':'katze katzen','Bürobedarf & Schreibwaren':'papier stifte buero'};
export function matchingDepartments({query='',root='Alle'}={}){const words=normalizeCategorySearch(query.slice(0,100)).split(' ').filter(Boolean);return departments.filter(item=>(root==='Alle'||item.name===root||item.parent===root)&&words.every(word=>normalizeCategorySearch(item.name+' '+(item.parent||'')+' '+item.description+' '+(aliases[item.name]||'')).includes(word)));}
export function mountCategorySelect(select,{includeAll=false}={}){
 const d=select.ownerDocument,old=select.value;select.replaceChildren();
 const option=(host,name)=>{const e=d.createElement('option');e.value=name;e.textContent=name;host.append(e);};
 if(includeAll)option(select,'Alle');
 for(const root of rootDepartments){const group=d.createElement('optgroup');group.label=root.name;option(group,root.name);for(const item of childrenOf(root.name))option(group,item.name);select.append(group);}
 if([...select.options].some(o=>o.value===old))select.value=old;
}
export function mountCategoryFilters(host){
 const d=host.ownerDocument;host.replaceChildren();
 function button(name){const e=d.createElement('button');e.type='button';e.dataset.category=name;e.textContent=name;e.setAttribute('aria-pressed',String(name==='Alle'));return e;}
 host.append(button('Alle'));
 for(const root of rootDepartments){const group=d.createElement('details'),summary=d.createElement('summary'),body=d.createElement('div');summary.textContent=root.name;group.className='category-filter-group';body.append(button(root.name));for(const child of childrenOf(root.name))body.append(button(child.name));group.append(summary,body);host.append(group);}
}
export function mountCategoryDirectory({host,search,status}){
 const d=host.ownerDocument,groups=[],items=[];host.replaceChildren();
 const make=(tag,text)=>{const e=d.createElement(tag);if(text!==undefined)e.textContent=text;return e;};
 const toolbar=make('div');toolbar.className='category-directory-tools';const label=make('label','Hauptbereich'),root=make('select'),clear=make('button','Suche leeren'),empty=make('div'),reset=make('button','Alle Kategorien anzeigen');root.id='category-directory-root';label.htmlFor=root.id;root.append(new d.defaultView.Option('Alle Hauptbereiche','Alle'));for(const item of rootDepartments)root.append(new d.defaultView.Option(item.name,item.name));clear.type=reset.type='button';clear.className=reset.className='outline';empty.className='category-directory-empty';empty.append(make('p','Keine passende Kategorie. Versuche zum Beispiel Laptop, Fahrrad oder Küche.'),reset);toolbar.append(label,root,clear);host.before(toolbar);host.after(empty);search.setAttribute('aria-controls',host.id);root.setAttribute('aria-controls',host.id);
 for(const department of rootDepartments){const section=make('section'),heading=make('h3'),list=make('div'),group={section,heading,department,items:[]};
  for(const item of [department,...childrenOf(department.name)]){const b=make('button',item.name);b.type='button';b.dataset.department=item.name;b.setAttribute('aria-pressed','false');list.append(b);const entry={button:b,item};items.push(entry);group.items.push(entry);}
  section.append(heading,list);host.append(section);groups.push(group);
 }
 function filter(){const matches=new Set(matchingDepartments({query:search.value,root:root.value}).map(item=>item.name));for(const group of groups){let visible=0;for(const entry of group.items){entry.button.hidden=!matches.has(entry.item.name);if(!entry.button.hidden)visible++;}group.section.hidden=!visible;group.heading.textContent=group.department.name+' · '+visible;}status.textContent=matches.size===1?'1 Kategorie oder Unterkategorie':matches.size+' Kategorien und Unterkategorien';clear.disabled=!search.value;empty.hidden=matches.size>0;host.scrollTop=0;}
 const clearQuery=()=>{search.value='';filter();search.focus();},resetAll=()=>{root.value='Alle';clearQuery();};
 const onKey=event=>{if(event.key==='Escape'&&search.value){event.preventDefault();clearQuery();}else if(event.key==='ArrowDown'||event.key==='Enter'){const visible=items.filter(entry=>!entry.button.hidden);if(visible.length){event.preventDefault();if(event.key==='Enter'&&visible.length===1)visible[0].button.click();else visible[0].button.focus();}}};
 search.addEventListener('input',filter);search.addEventListener('keydown',onKey);root.addEventListener('change',filter);clear.addEventListener('click',clearQuery);reset.addEventListener('click',resetAll);filter();
 return {setSelected(name){for(const {button,item}of items)button.setAttribute('aria-pressed',String(item.name===name));},dispose(){search.removeEventListener('input',filter);search.removeEventListener('keydown',onKey);root.removeEventListener('change',filter);clear.removeEventListener('click',clearQuery);reset.removeEventListener('click',resetAll);toolbar.remove();empty.remove();}};
}
