import {marketGross as gross,marketMoney as money,marketLines} from './market-policy.js';
import {offerId} from './offer-policy.js';
import {marketError} from './market-client.js';
const key='bringness.market.compare.v1';
const valid=x=>x&&offerId(x.id)&&typeof x.sku==='string'&&/^[A-Za-z0-9_-]{1,60}$/.test(x.sku);
export function mountMarketComparison({window:w,document:d=w.document,client,onChange=()=>{}}){
 const host=d.getElementById('market-comparison');if(!host)return null;
 const el=(tag,text)=>{const e=d.createElement(tag);if(text!==undefined)e.textContent=text;return e;};
 const button=(label,fn)=>{const b=el('button',label);b.type='button';b.addEventListener('click',fn);return b;};
 let selection=[],epoch=0,opened=false,method='shipping';
 try{const raw=w.sessionStorage.getItem(key);if(raw){if(raw.length>1000)throw Error();const items=JSON.parse(raw);if(!Array.isArray(items)||items.length>3||!items.every(valid)||new Set(items.map(x=>x.id+'|'+x.sku)).size!==items.length)throw Error();selection=items.map(({id,sku})=>({id,sku}));}}catch{}
 const title=el('h2','Händlerangebote vergleichen'),note=el('p','Bis zu drei gewählte Varianten. Jeder Gesamtpreis gilt für ein Stück als separate Händlerbestellung, inkl. MwSt. Keine Reservierung. Unterschiedliche Produkte sind nicht automatisch gleichwertig.');
 const toggle=button('',()=>{opened=!opened;update();if(opened)refresh();});toggle.id='market-compare-open';toggle.setAttribute('aria-controls','market-comparison-content');
 const content=el('div');content.id='market-comparison-content';content.hidden=true;
 const label=el('label','Vergleichen mit '),select=el('select');select.id='market-compare-method';for(const [value,text]of [['shipping','Versand'],['pickup','Abholung']]){const o=el('option',text);o.value=value;select.append(o);}label.append(select);
 const message=el('p');message.id='market-compare-status';message.setAttribute('role','status');
 const results=el('div');results.id='market-compare-results';
 const reload=button('Aktuelle Preise prüfen',()=>refresh()),clear=button('Vergleich leeren',()=>{selection=[];save();update();refresh();onChange();});clear.id='market-compare-clear';
 content.append(note,label,reload,clear,message,results);host.append(title,toggle,content);
 function update(){toggle.textContent='Angebotsvergleich ('+selection.length+'/3) '+(opened?'schließen':'öffnen');toggle.setAttribute('aria-expanded',String(opened));content.hidden=!opened;clear.disabled=!selection.length;reload.disabled=!selection.length;}
 function save(){try{w.sessionStorage.setItem(key,JSON.stringify(selection));}catch{message.textContent='Vergleich bleibt nur in dieser Ansicht erhalten; Speichern ist nicht möglich.';}}
 const has=(id,sku)=>selection.some(x=>x.id===id&&x.sku===sku);
 function remove(item){selection=selection.filter(x=>x.id!==item.id||x.sku!==item.sku);save();update();refresh();onChange();}
 async function refresh(){
  const current=++epoch,chosen=selection.map(x=>({...x})),deliveryMethod=method;results.replaceChildren();if(!opened)return;
  if(!chosen.length){message.textContent='Wähle bei einem Händlerangebot eine Variante und „Zum Vergleich“. ';return;}
  message.textContent='Aktuelle Angebote und Gesamtpreise werden geprüft.';results.setAttribute('aria-busy','true');
  const checks=await Promise.all(chosen.map(async item=>{
   try{const p=await client.call('/offers/'+encodeURIComponent(item.id));if(p.id!==item.id||!Array.isArray(p.variants)||!p.seller||typeof p.title!=='string')throw Error();const v=p.variants.find(v=>v.sku===item.sku);if(!v)throw Object.assign(Error(),{code:'OFFER_NOT_FOUND'});
    marketLines([{id:p.id,revision:p.revision,sku:v.sku,quantity:1,unitNetCents:v.netCents}]);if(![0,700,1900].includes(v.vatBasisPoints)||!Number.isSafeInteger(v.stock)||v.stock<0)throw Error();
    const entry={item,p,v};if(!v.stock){entry.problem='Nicht verfügbar';return entry;}if(p[deliveryMethod]!==true){entry.problem=deliveryMethod==='shipping'?'Kein Versand':'Keine Abholung';return entry;}
    const shippingNetCents=deliveryMethod==='shipping'?p.shippingNetCents:0,q=await client.call('/quote',{body:{lines:[{id:p.id,revision:p.revision,sku:v.sku,quantity:1,unitNetCents:v.netCents}],method:deliveryMethod,shippingNetCents}});
    const shipping=deliveryMethod==='shipping'?gross(p.shippingNetCents,p.shippingVatBasisPoints):0,unit=gross(v.netCents,v.vatBasisPoints);
    if(q.sellerId!==p.sellerId||q.method!==deliveryMethod||q.canPay!==false||q.paymentStatus!=='unpaid'||!Number.isSafeInteger(shipping)||shipping<0||q.grossCents!==unit+shipping)throw Error();return {...entry,total:q.grossCents,shipping};
   }catch(error){return {item,problem:marketError(error)};}
  }));
  if(current!==epoch||!opened)return;
  const wrap=el('div');wrap.className='market-comparison-scroll';wrap.tabIndex=0;wrap.setAttribute('role','region');wrap.setAttribute('aria-label','Angebotsvergleich, seitlich verschiebbar');
  const table=el('table');table.className='market-comparison-table';table.append(el('caption','Aktuelle Händlerangebote · ein Stück je Variante'));
  const head=el('thead'),hr=el('tr');hr.append(el('th','Merkmal'));for(const c of checks){const th=el('th');th.scope='col';const a=el('a',c.p?.title||'Angebot nicht verfügbar');a.href='/shop/marketplace.html?offer='+encodeURIComponent(c.item.id);th.append(a);hr.append(th);}head.append(hr);table.append(head);
  const body=el('tbody');const min=Math.min(...checks.filter(c=>c.total!==undefined).map(c=>c.total));
  for(const [name,value]of [
   ['Variante',c=>c.v?.label||c.item.sku],['Verkäufer',c=>c.p?.seller.name||'Nicht bestätigt'],['Kategorie',c=>c.p?.category||'—'],['Zustand',c=>({new:'Neu',used:'Gebraucht',refurbished:'Generalüberholt'}[c.p?.condition]||'—')],['GTIN',c=>c.p?.gtin||'Nicht angegeben'],['Stückpreis inkl. MwSt.',c=>c.v?money(gross(c.v.netCents,c.v.vatBasisPoints)):'Nicht bestätigt'],['Versand inkl. MwSt.',c=>c.shipping!==undefined?(deliveryMethod==='pickup'?'Entfällt bei Abholung':money(c.shipping)):'Nicht bestätigt'],['Gesamtpreis für ein Stück',c=>c.total===undefined?'Nicht bestätigt':money(c.total)+(checks.filter(x=>x.total!==undefined).length>1&&c.total===min?' · niedrigster geprüfter Gesamtpreis dieser Auswahl':'')],['Lieferung / Abholort',c=>c.p?String(deliveryMethod==='shipping'?c.p.delivery||'Kein Versand':c.p.pickupAddress||'Keine Abholung'):'Nicht bestätigt'],['Bestand / Prüfung',c=>c.problem||(c.v.stock+' verfügbar · Preis geprüft')]
  ]){const tr=el('tr'),th=el('th',name);th.scope='row';tr.append(th);for(const c of checks)tr.append(el('td',value(c)));body.append(tr);}
  const actions=el('tr');actions.append(el('th','Auswahl'));for(const c of checks){const td=el('td');td.append(button('Entfernen',()=>remove(c.item)));actions.append(td);}body.append(actions);table.append(body);wrap.append(table);results.replaceChildren(wrap);results.setAttribute('aria-busy','false');message.textContent='Vergleich aktualisiert. Preise und Bestand können sich ändern; vor der Bestellung erneut prüfen. Rückgabebedingungen beim jeweiligen Verkäufer erfragen.';
 }
 select.addEventListener('change',()=>{method=select.value;refresh();});
 const hide=()=>{epoch++;results.replaceChildren();results.setAttribute('aria-busy','false');message.textContent='Bitte aktuelle Preise erneut prüfen.';};
 w.addEventListener('pagehide',hide);d.addEventListener('visibilitychange',()=>{if(d.hidden)hide();});w.addEventListener('storage',e=>{if(e.key==='bringness-shop-token'||e.key===null)hide();});w.addEventListener('pageshow',e=>{if(e.persisted&&opened)refresh();});
 update();return {has,refresh,toggle(id,sku){if(!valid({id,sku}))return false;if(has(id,sku))remove({id,sku});else{if(selection.length===3){opened=true;update();message.textContent='Höchstens drei Varianten. Entferne zuerst ein Angebot aus dem Vergleich.';content.scrollIntoView?.({block:'nearest'});return false;}selection.push({id,sku});save();opened=true;update();refresh();onChange();}return true;}};
}
