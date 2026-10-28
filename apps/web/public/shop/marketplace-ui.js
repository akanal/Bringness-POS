import {mountMarketOrderViews} from './market-order-ui.js';
import {createMarketClient,marketError} from './market-client.js';
import {marketMoney as money,marketGross as gross,marketLines} from './market-policy.js';
const publicId=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export function mountMarketplace({window:w,document:d=w.document,client:provided}){
 const $=id=>d.getElementById(id),el=(tag,text)=>{const e=d.createElement(tag);if(text!==undefined)e.textContent=text;return e;};
 const categories=new Set();
 const edits=new Map();let rows=[],cart=[],quote=null,busy=false,searchEpoch=0,cartEpoch=0,activeSeller='',sellerContext='',detailId='',nextCursor='';
 const client=provided||createMarketClient({window:w,onPrivacy:()=>{quote=null;busy=false;cartEpoch++;$('market-recipient').reset();$('market-confirm').hidden=true;status('Ansicht gewechselt. Auswahl vor dem Senden erneut prüfen.');}});
 const status=(text,error=false)=>{$('market-status').textContent=text;$('market-status').classList.toggle('market-error',error);};
 const link=(label,params)=>{const a=el('a',label);a.href='/shop/marketplace.html?'+new URLSearchParams(params);return a;};
 const cartKey='bringness.market.cart.v1';
 try{
  const raw=w.sessionStorage.getItem(cartKey);
  if(raw){if(raw.length>40000)throw Error();cart=JSON.parse(raw);if(!Array.isArray(cart)||cart.length>20)throw Error();if(cart.length)marketLines(cart.map(x=>x.line));
   for(const x of cart)if(typeof x.title!=='string'||x.title.length>120||typeof x.label!=='string'||x.label.length>100||typeof x.seller!=='string'||x.seller.length>500||x.sellerId!==undefined&&!publicId(x.sellerId)||!Number.isSafeInteger(x.shippingNetCents)||x.shippingNetCents<0||x.shippingNetCents>100000000||typeof x.pickup!=='boolean'||typeof x.shipping!=='boolean')throw Error();
  }
 }catch{cart=[];status('Gespeicherte Auswahl ist nicht lesbar. Sie wurde nicht überschrieben.',true);}
 function selected(){return cart.filter(x=>(x.sellerId||'legacy')===activeSeller);}
 function invalidate(){cartEpoch++;quote=null;$('market-total').textContent='';$('market-summary').replaceChildren();$('market-confirm').hidden=true;}
 function saveCart(){try{w.sessionStorage.setItem(cartKey,JSON.stringify(cart));return true;}catch{status('Auswahl bleibt hier erhalten, konnte aber nicht gespeichert werden.',true);return false;}}
 function changed(){invalidate();const persisted=saveCart();renderCart();return persisted;}
 function renderCart(){
  const host=$('market-cart'),selector=$('market-cart-seller');host.replaceChildren();selector.replaceChildren();
  const groups=new Map();for(const item of cart)groups.set(item.sellerId||'legacy',item.seller);
  if(!groups.has(activeSeller))activeSeller=groups.keys().next().value||'';
  for(const [id,name]of groups){const option=el('option',name+(id==='legacy'?' · frühere Auswahl erneut zuordnen':''));option.value=id;selector.append(option);}selector.value=activeSeller;selector.disabled=busy||groups.size<2;
  for(const [i,item]of cart.entries()){
   const box=el('div');box.append(el('p',item.title+' · '+item.label),el('small',item.seller));
   const input=el('input'),editKey=item.line.id+'|'+item.line.sku;input.type='number';input.min='1';input.max='999';input.value=edits.get(editKey)??item.line.quantity;input.disabled=busy;input.setAttribute('aria-label','Menge für '+item.title);
   input.addEventListener('input',()=>{edits.set(editKey,input.value);invalidate();const n=Number(input.value);if(!/^\d+$/.test(input.value)||!Number.isInteger(n)||n<1||n>999){input.setCustomValidity('Menge 1 bis 999 angeben.');return;}input.setCustomValidity('');item.line.quantity=n;saveCart();});
   if(edits.has(editKey)&&(!/^\d+$/.test(input.value)||Number(input.value)<1||Number(input.value)>999))input.setCustomValidity('Menge 1 bis 999 angeben.');
   const remove=el('button','Entfernen');remove.type='button';remove.disabled=busy;remove.addEventListener('click',()=>{edits.delete(editKey);cart.splice(i,1);changed();});box.append(input,remove);host.append(box);
  }
  if(!cart.length)host.append(el('p','Noch keine Händlerware ausgewählt.'));
  if(activeSeller==='legacy')host.append(el('p','Frühere Auswahl ohne eindeutige Händlerkennung: Die Artikel bleiben sichtbar. Bitte entfernen und aus dem aktuellen Angebot erneut hinzufügen.'));
  const chosen=selected(),method=$('market-method');method.disabled=busy;
  for(const option of method.options)option.disabled=chosen.length>0&&!chosen.every(x=>x[option.value]);
  $('market-quote').disabled=!chosen.length||busy||activeSeller==='legacy'||!chosen.every(x=>x[method.value]);
 }
 function add(p,v){
  if(busy)return;if([...$('market-cart').querySelectorAll('input')].some(i=>!i.checkValidity())){status('Bitte zuerst die ungültige Mengenangabe korrigieren.',true);return;}
  if(!publicId(p.sellerId)||!v?.stock){status('Bitte das aktuelle Händlerangebot erneut laden.',true);return;}
  const found=cart.find(x=>x.line.id===p.id&&x.line.sku===v.sku);
  if(found){if(found.line.revision!==p.revision||found.sellerId!==p.sellerId){status('Die frühere Auswahl ist veraltet. Bitte entfernen und neu hinzufügen.',true);return;}if(found.line.quantity>=v.stock){status('Der verfügbare Bestand ist bereits ausgewählt.',true);return;}found.line.quantity++;edits.delete(found.line.id+'|'+found.line.sku);}
  else{if(cart.length>=20){status('Höchstens 20 Varianten in der gesamten Händlerauswahl.',true);return;}cart.push({title:p.title,label:v.label,seller:p.seller.name+' · '+p.seller.email,sellerId:p.sellerId,shipping:p.shipping,pickup:p.pickup,shippingNetCents:p.shippingNetCents,line:{id:p.id,revision:p.revision,sku:v.sku,quantity:1,unitNetCents:v.netCents}});}
  activeSeller=p.sellerId;if(!selected().every(x=>x[$('market-method').value]))$('market-method').value=selected().every(x=>x.shipping)?'shipping':'pickup';
  const persisted=changed();if(persisted)status('Zur Händlerauswahl hinzugefügt. Jede Händlerbestellung wird einzeln geprüft und bestätigt.');
 }
 function render(){
  const host=$('market-results');host.replaceChildren();
  for(const p of rows){
   const box=el('article');box.dataset.offerId=p.id;
   const heading=el('h3');heading.append(link(p.title,{offer:p.id}));box.append(heading,el('p','Anzeige '+p.listingNumber+' · '+p.category));
   box.append(link('Händlerprofil: '+p.seller.name,{seller:p.sellerId}),el('p',detailId?p.description:p.description.slice(0,240)+(p.description.length>240?' …':'')),el('p',p.seller.street+', '+p.seller.postalCode+' '+p.seller.city+' · '+p.seller.country));
   if(detailId){box.append(el('p','Geschäftlicher Kontakt: '+p.seller.email),el('p','Zustand: '+({new:'Neu',used:'Gebraucht',refurbished:'Generalüberholt'}[p.condition]||p.condition)));if(p.gtin)box.append(el('p','GTIN: '+p.gtin));}
   box.append(el('p',p.shipping?'Versand: '+p.delivery+' · '+money(gross(p.shippingNetCents,p.shippingVatBasisPoints))+' inkl. MwSt. je Händlerbestellung':'Kein Versand'),el('p',p.pickup?'Abholung: '+p.pickupAddress:'Keine Abholung'));
   const select=el('select');select.setAttribute('aria-label','Variante für '+p.title);
   for(const v of p.variants){const o=el('option',v.label+' · '+money(gross(v.netCents,v.vatBasisPoints))+' inkl. MwSt. · Bestand '+v.stock);o.value=v.sku;o.disabled=v.stock===0;select.append(o);}
   const first=p.variants.find(v=>v.stock>0);if(first)select.value=first.sku;
   const availability=el('p'),addButton=el('button','Zur Händlerauswahl');addButton.type='button';
   const update=()=>{const v=p.variants.find(v=>v.sku===select.value);addButton.disabled=!v?.stock;availability.textContent=v?v.stock+' verfügbar · '+money(gross(v.netCents,v.vatBasisPoints))+' inkl. MwSt.':'';};select.addEventListener('change',update);update();
   addButton.addEventListener('click',()=>add(p,p.variants.find(v=>v.sku===select.value)));box.append(select,availability,addButton);host.append(box);
  }
  if(!rows.length)host.append(el('p','Keine veröffentlichten Händlerangebote für diese Suche.'));
 }
 function updateCategories(value=$('market-category').value){
  const select=$('market-category');if(value&&value.length<=80)categories.add(value);
  for(const p of rows)if(typeof p.category==='string'&&p.category.length<=80)categories.add(p.category);
  select.replaceChildren();const all=el('option','Alle');all.value='';select.append(all);
  for(const category of [...categories].sort((a,b)=>a.localeCompare(b,'de'))){const option=el('option',category);option.value=category;select.append(option);}
  select.value=value;
 }
 function parameters(){return new URLSearchParams(Object.entries({q:$('market-search').value.trim(),category:$('market-category').value.trim(),seller:sellerContext,method:$('market-filter-method').value,available:$('market-available').checked?'1':'',offer:detailId}).filter(([,v])=>v));}
 function readLocation(){const u=new URL(w.location.href);$('market-search').value=u.searchParams.get('ad')||u.searchParams.get('q')||'';updateCategories(u.searchParams.get('category')||'');$('market-filter-method').value=['shipping','pickup'].includes(u.searchParams.get('method'))?u.searchParams.get('method'):'';$('market-available').checked=u.searchParams.get('available')==='1';sellerContext=u.searchParams.get('seller')||'';detailId=u.searchParams.get('offer')||'';}
 async function search(append=false){
  const current=++searchEpoch,params=parameters(),cursor=nextCursor;$('market-next').disabled=true;
  try{
   let result,profile=null;
   if(detailId){const offer=await client.call('/offers/'+encodeURIComponent(detailId));result={offers:[offer],nextCursor:null};}
   else{params.delete('offer');if(append)params.set('cursor',cursor);[result,profile]=await Promise.all([client.call('?'+params),sellerContext?client.call('/sellers/'+encodeURIComponent(sellerContext)):Promise.resolve(null)]);}
   if(current!==searchEpoch)return;
   if(!Array.isArray(result.offers)||!result.offers.every(p=>publicId(p.sellerId)&&Array.isArray(p.variants)))throw Object.assign(Error(),{code:'INVALID_RESPONSE'});
   rows=append?[...rows,...result.offers]:result.offers;updateCategories();render();
   const context=$('market-context');context.replaceChildren();if(profile){context.append(el('h2',profile.profile.name),el('p',profile.profile.street+', '+profile.profile.postalCode+' '+profile.profile.city+' · '+profile.profile.country),el('p',profile.profile.email),el('p','Geschäftliche Kontaktdaten des freigegebenen Händlers. Onlinezahlung ist nicht freigeschaltet.'));}
   if(profile||detailId)context.append(link('Alle Händlerangebote',{}));
   nextCursor=result.nextCursor||'';$('market-next').hidden=!nextCursor;
  }catch(e){if(current===searchEpoch){rows=[];nextCursor='';render();$('market-context').replaceChildren();$('market-next').hidden=true;status(marketError(e),true);}}
  finally{if(current===searchEpoch)$('market-next').disabled=false;}
 }
 $('market-search-form').addEventListener('submit',e=>{e.preventDefault();detailId='';const p=parameters();w.history.pushState(null,'',w.location.pathname+(p.size?'?'+p:''));search();});
 $('market-category').addEventListener('change',()=>{$('market-search-form').requestSubmit();});
 $('market-reset').addEventListener('click',()=>{sellerContext='';detailId='';$('market-search-form').reset();w.history.pushState(null,'',w.location.pathname);search();});
 w.addEventListener('popstate',()=>{readLocation();search();});$('market-next').addEventListener('click',()=>search(true));
 $('market-method').addEventListener('change',()=>{invalidate();renderCart();});$('market-cart-seller').addEventListener('change',()=>{activeSeller=$('market-cart-seller').value;invalidate();renderCart();});
 function commandLines(){const chosen=selected();const invalid=cart.some(x=>{const value=String(edits.get(x.line.id+'|'+x.line.sku)??x.line.quantity);return !/^\d+$/.test(value)||Number(value)<1||Number(value)>999;});if(!chosen.length||invalid)throw Error('Bitte gültige Mengen eingeben.');return marketLines(chosen.map(x=>({...x.line})));}
 $('market-quote').addEventListener('click',async()=>{
  if(busy)return;busy=true;renderCart();const current=cartEpoch;
  try{
   if(!selected().length)return;quote=null;$('market-confirm').hidden=true;$('market-total').textContent='';$('market-summary').replaceChildren();
   const lines=commandLines(),method=$('market-method').value,shippingNetCents=method==='shipping'?selected()[0].shippingNetCents:0;
   const q=await client.call('/quote',{body:{lines,method,shippingNetCents}});if(current!==cartEpoch)return;
   if(q.sellerId!==activeSeller||q.method!==method||q.paymentStatus!=='unpaid'||q.canPay!==false||!Array.isArray(q.lines)||![q.grossCents,q.vatCents,q.netCents].every(n=>Number.isSafeInteger(n)&&n>=0))throw Object.assign(Error(),{code:'INVALID_RESPONSE'});
   quote={...q,lines,shippingNetCents};$('market-total').textContent='Gesamt '+money(q.grossCents)+' inkl. '+money(q.vatCents)+' MwSt. · '+q.seller.name+' · '+q.delivery;
   for(const line of q.lines)$('market-summary').append(el('li',line.quantity+' × '+line.name+' · '+money(gross(line.unitNetCents*line.quantity,line.vatBasisPoints))+' inkl. MwSt.'));
   $('market-confirm').hidden=false;status('Preis und Bestand dieses Händlers geprüft. Andere Händlerauswahlen bleiben getrennt. Keine Zahlung.');
  }catch(e){status(e.message?.startsWith('Bitte ')?e.message:marketError(e),true);}finally{busy=false;renderCart();}
 });
 function showOrder(result,confirmedLines){
  quote=null;
  for(const line of confirmedLines){const item=cart.find(x=>x.line.id===line.id&&x.line.sku===line.sku);if(item&&item.line.revision===line.revision&&item.line.unitNetCents===line.unitNetCents){item.line.quantity=Math.max(0,item.line.quantity-line.quantity);edits.delete(line.id+'|'+line.sku);}}
  cart=cart.filter(x=>x.line.quantity>0);const persisted=changed();$('market-recipient').reset();$('market-total').textContent='Bestellung '+result.reference+' an '+result.seller.name+' übergeben · '+money(result.grossCents)+' · unbezahlt.';
  status(persisted?'Dieser Händler hat die Bestellung im Eingang. Andere Händlerauswahlen bleiben erhalten. Keine Zahlung ausgelöst.':'Bestellung bestätigt. Auswahl konnte nicht gespeichert werden. Nach Neuladen bitte nicht erneut bestellen.',!persisted);search();
 }
 $('market-recipient').addEventListener('submit',async e=>{
  e.preventDefault();if(!quote||busy||!$('market-recipient').reportValidity())return;
  const frozen=quote,recipient=Object.fromEntries(['name','street','postalCode','city','country','email'].map(k=>[k,$('buyer-'+k).value]));
  if(!w.confirm('Unbezahlte Bestellung an '+frozen.seller.name+' übergeben?\n'+money(frozen.grossCents)+' inkl. MwSt.\n'+recipient.name+', '+recipient.street+', '+recipient.postalCode+' '+recipient.city+'\nKeine Onlinezahlung.'))return;
  busy=true;renderCart();try{const result=await client.write('orders',{requestId:w.crypto.randomUUID(),lines:frozen.lines,method:frozen.method,shippingNetCents:frozen.shippingNetCents,recipient});showOrder(result,frozen.lines);}catch(error){quote=null;$('market-confirm').hidden=true;status(marketError(error),true);}finally{busy=false;renderCart();}
 });
 for(const [id,fn]of [['market-retry',()=>client.retry('orders')],['market-recover',()=>client.recoverOrder()]])$(id).addEventListener('click',async()=>{if(busy)return;busy=true;renderCart();try{const pending=await client.pending('orders');if(!pending)throw Object.assign(Error(),{code:'NO_PENDING_REQUEST'});showOrder(await fn(),marketLines(pending.lines));}catch(error){status(marketError(error),true);}finally{busy=false;renderCart();}});
 mountMarketOrderViews({window:w,document:d,client,seller:false});readLocation();renderCart();search();return {search,client,getCart:()=>structuredClone(cart)};
}
