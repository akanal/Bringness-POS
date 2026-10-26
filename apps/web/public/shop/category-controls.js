import {departments,rootDepartments} from './departments.js?v=categories-20261026';
const childrenOf=name=>departments.filter(item=>item.parent===name);
const normalize=value=>value.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('de');
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
 const d=host.ownerDocument,groups=[];host.replaceChildren();
 for(const root of rootDepartments){const section=d.createElement('section'),heading=d.createElement('h3'),list=d.createElement('div');heading.textContent=root.name;const items=[];
  for(const item of [root,...childrenOf(root.name)]){const b=d.createElement('button');b.type='button';b.dataset.department=item.name;b.textContent=item.name;list.append(b);items.push({button:b,text:normalize(item.name+' '+root.name+' '+item.description)});}
  section.append(heading,list);host.append(section);groups.push({section,items});
 }
 function filter(){const words=normalize(search.value.slice(0,100)).trim().split(/\s+/).filter(Boolean);let count=0;for(const group of groups){let visible=0;for(const item of group.items){const match=words.every(w=>item.text.includes(w));item.button.hidden=!match;if(match){visible++;count++;}}group.section.hidden=!visible;}status.textContent=count?`${count} Kategorien und Unterkategorien`:'Keine passende Kategorie. Versuche einen anderen Suchbegriff.';}
 search.addEventListener('input',filter);filter();
}
