// One UI translation engine for POS and AI. Business records are never sent here.
(() => {
 const snapshot=window.BringnessLanguageCatalog;
 function slice(system){const dictionary=Object.create(null);for(const namespace of ['common',system])for(const entry of snapshot.entries)if(entry.namespace===namespace)dictionary[entry.source]=entry.translations;return {version:snapshot.version,languages:snapshot.languages,dictionary}}
 function valid(value){return value&&Number.isFinite(value.version)&&value.languages?.de&&value.dictionary&&typeof value.dictionary==='object'&&Object.entries(value.languages).every(([code,label])=>/^[a-z]{2,3}$/.test(code)&&typeof label==='string')&&Object.values(value.dictionary).every(record=>record&&typeof record.de==='string'&&Object.values(record).every(text=>typeof text==='string'))}
 function storageGet(key){try{return localStorage.getItem(key)}catch{return null}}
 function storageSet(key,value){try{localStorage.setItem(key,value)}catch{/* Storage-disabled/private browsers still translate this session. */}}
 window.BringnessI18n={mount(config){
  const {system,storageKey,selectorId}=config;if(!['ai','pos'].includes(system))throw Error('Unknown UI language namespace');
  if(document.getElementById(selectorId))return;
  let catalog=slice(system);const cacheKey='bringness-ui-catalog-'+system;
  try{const cached=JSON.parse(storageGet(cacheKey));if(valid(cached)&&cached.version>=catalog.version)catalog=cached}catch{/* Use bundled snapshot. */}
  let language=storageGet(storageKey)||navigator.language.toLowerCase().split('-')[0];if(!catalog.languages[language])language='de';
  const originals=new WeakMap(),rendered=new WeakMap(),attributes=new WeakMap(),renderedAttributes=new WeakMap();
  const selector=document.createElement('select');selector.id=selectorId;selector.className='shared-language-selector';selector.setAttribute('aria-label','Sprache / Language / Dil');
  const header=document.querySelector('header');header.insertBefore(selector,system==='pos'?header.querySelector('.connectionstatus'):null);
  function choices(){selector.replaceChildren();for(const [code,label]of Object.entries(catalog.languages)){const option=document.createElement('option');option.value=code;option.textContent=label;selector.append(option)}selector.value=language}
  function translate(source){return catalog.dictionary[source]?.[language]||source}
  function sourceFor(current,prior){if(prior&&(current===prior||Object.values(catalog.dictionary[prior]||{}).includes(current)))return prior;return current}
  function update(){document.documentElement.lang=language;window.BringnessLanguage=language;
   for(const element of document.querySelectorAll(config.nodes)){
    if(element.closest('[data-no-i18n]'))continue;
    if(element.tagName==='OPTION'&&(element.closest('#'+selectorId)||/^[0-9a-f-]{36}$/i.test(element.value)))continue;
    for(const node of element.childNodes){if(node.nodeType!==3)continue;const current=node.textContent.trim(),source=rendered.get(node)===current?originals.get(node):sourceFor(current,originals.get(node));if(!catalog.dictionary[source])continue;originals.set(node,source);const target=node.textContent.replace(current,translate(source));if(node.textContent!==target)node.textContent=target;rendered.set(node,target.trim())}
   }
   for(const element of document.querySelectorAll(config.attributes)){
    if(element.closest('[data-no-i18n]')||element===selector)continue;
    const state=attributes.get(element)||{},last=renderedAttributes.get(element)||{};
    for(const key of ['placeholder','aria-label']){const current=element.getAttribute(key);if(!current)continue;const source=last[key]===current?state[key]:sourceFor(current,state[key]);if(!catalog.dictionary[source])continue;state[key]=source;const target=translate(source);if(current!==target)element.setAttribute(key,target);last[key]=target}attributes.set(element,state);renderedAttributes.set(element,last);
   }
  }
  const observer=new MutationObserver(update);observer.observe(document.body,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['placeholder','aria-label']});
  selector.addEventListener('change',()=>{language=selector.value;storageSet(storageKey,language);update()});choices();update();
  fetch('/api/languages/catalog?system='+system,{credentials:'omit',...(window.AbortSignal?.timeout?{signal:window.AbortSignal.timeout(5000)}:{})}).then(response=>{if(!response.ok)throw Error('Language catalog unavailable');return response.json()}).then(value=>{
   if(!valid(value)||value.version<catalog.version)return;
   catalog=value;storageSet(cacheKey,JSON.stringify(value));if(!catalog.languages[language])language='de';choices();update();
  }).catch(()=>{/* Offline snapshot/cache keeps all interface controls usable. */});
  return {refresh:update,disconnect:()=>observer.disconnect()};
 }};
})();
