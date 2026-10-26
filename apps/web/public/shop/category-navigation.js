import {departments,rootDepartments} from './departments.js?v=categories-20261026';
export function renderCategoryNavigation({host,category,onSelect}){
 const d=host.ownerDocument,selected=departments.find(item=>item.name===category);host.replaceChildren();host.hidden=!selected;if(!selected)return;
 const make=(tag,text)=>{const e=d.createElement(tag);e.textContent=text;return e;};
 const button=(name,label=name)=>{const b=make('button',label);b.type='button';b.className='outline';b.addEventListener('click',()=>onSelect(name));return b;};
 const trail=make('nav','');trail.setAttribute('aria-label','Kategorienpfad');trail.append(button('Alle','Alle Kategorien'));if(selected.parent)trail.append(make('span','›'),button(selected.parent));const current=make('strong',selected.name);current.setAttribute('aria-current','page');trail.append(make('span','›'),current);host.append(trail);
 const related=departments.filter(item=>item.parent===(selected.parent||selected.name)&&item.name!==selected.name);if(related.length){const group=make('div','');group.className='category-related';group.setAttribute('role','group');group.setAttribute('aria-label',selected.parent?'Weitere Kategorien in '+selected.parent:'Unterkategorien von '+selected.name);group.append(make('span',selected.parent?'Weitere Kategorien:':'Unterkategorien:'));for(const item of related)group.append(button(item.name));host.append(group);}
}
