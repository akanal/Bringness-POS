(() => {
 const root=document.getElementById('aiPrices');
 const settings=document.getElementById('aiPricesSettings');
 if(!root||!settings)return;
 const dialog=document.createElement('dialog');
 dialog.id='aiPricesDialog';
 dialog.setAttribute('aria-label','Automatische AI-Preisaktionen');
 dialog.append(document.createElement('form'));
 dialog.addEventListener('close',()=>dialog.remove());
 const format=new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR'});
 const formatTime=new Intl.DateTimeFormat('de-DE',{hour:'2-digit',minute:'2-digit',timeZone:'Europe/Berlin'});
 const button=(label,action)=>{
  const b=document.createElement('button');
  b.type='button';b.textContent=label;b.onclick=action;
  return b;
 };
 window.bnPosAiPrices={connect({context,api,products,setPrices}) {
  let current=null, pending=false, signature='', request=0;
  const message=document.getElementById('aiPricesMessage');
  function matches(state){const c=context();return c.token===state.token&&c.restaurantId===state.restaurantId}
  function clearNotice(){settings.hidden=true;settings.onclick=null;root.hidden=true;root.replaceChildren();signature='';current=null}
  async function change(state,body){
   if(!matches(state)||pending)return;
   pending=true;request++;
   try {
    await api('/ai-price-actions?restaurantId='+encodeURIComponent(state.restaurantId),{method:'POST',body:JSON.stringify(body)});
    message.textContent='';
    if(dialog.open&&matches(state))dialog.close();
   } catch(error){message.textContent=error.message}
   finally{pending=false;await refresh()}
  }
  function open(state,rule,linked){
   if(!matches(state))return;
   const form=dialog.querySelector('form');
   form.replaceChildren();
   const heading=document.createElement('h2');
   heading.textContent='Bringness AI · Preisaktionen';
   const header=document.createElement('header'),mark=document.createElement('span');
   header.className='pos-ai-heading';mark.className='pos-ai-mark';mark.textContent='AI';mark.setAttribute('aria-hidden','true');
   header.append(mark,heading);form.append(header);
   const status=document.createElement('p');
   status.textContent=linked?'Bringness AI ist mit diesem Standort verbunden.':'Für diesen Standort ist derzeit keine aktive Bringness-AI-Verbindung bestätigt.';
   form.append(status);
   const close=button('Schließen',()=>dialog.close());
   form.onsubmit=event=>event.preventDefault();
   if(rule.enabled){
    const summary=document.createElement('p');
    summary.textContent=rule.product_ids.length+' freigegebene Artikel · '+rule.discount_percent+' % Rabatt · bis zu '+rule.duration_minutes+' Minuten';
    form.append(summary,button('Freigabe widerrufen',()=>change(state,{action:'disable'})),close);
   } else if(!linked) {
    const connect=document.createElement('a');
    connect.href='https://bringness-ai.com/ai.html#betrieb-einrichten';
    connect.textContent='Bringness AI einrichten und Standort verbinden';
    form.append(connect,close);
   } else {
    const help=document.createElement('p');
    help.textContent='Bringness AI kann diese Artikel reduzieren, wenn geprüfte Zutaten am selben Tag ihr Mindesthaltbarkeitsdatum erreichen. Die Aktion endet spätestens um Mitternacht.';
    const choices=document.createElement('fieldset');
    const legend=document.createElement('legend');legend.textContent='Zugelassene Artikel';choices.append(legend);
    for(const product of products(state.restaurantId)){
     const label=document.createElement('label'), input=document.createElement('input');
     input.type='checkbox';input.name='product';input.value=product.id;
     label.append(input,document.createTextNode(' '+product.name));
     const row=document.createElement('div'),floorLabel=document.createElement('label'),floor=document.createElement('input');
     row.className='pos-ai-item';floorLabel.textContent='Mindestpreis (€) ';
     floor.type='number';floor.name='floor-'+product.id;floor.min='0.01';floor.max='100000';floor.step='0.01';floor.disabled=true;
     input.onchange=()=>{floor.disabled=!input.checked};
     floorLabel.append(floor);row.append(label,floorLabel);choices.append(row);
    }
    const number=(name,text,min,max,value)=>{
     const label=document.createElement('label'),input=document.createElement('input');
     input.name=name;input.type='number';input.min=min;input.max=max;input.value=value;input.required=true;
     label.append(document.createTextNode(text+' '),input);return label;
    };
    const confirmLabel=document.createElement('label'),confirm=document.createElement('input');
    confirm.type='checkbox';confirm.name='confirmed';confirm.required=true;
    confirmLabel.append(confirm,document.createTextNode(' Bringness AI darf Aktionen nach diesen Regeln automatisch starten.'));
    const save=button('Freigabe erteilen',()=>form.requestSubmit());
    save.className='pos-ai-primary';
    const limits=document.createElement('fieldset'),title=document.createElement('legend');
    title.textContent='Rabatt und Laufzeit';limits.append(title,number('discountPercent','Rabatt in Prozent',1,50,rule.discount_percent),number('durationMinutes','Minuten',15,240,rule.duration_minutes));
    form.append(help,choices,limits,confirmLabel,save,close);
    form.onsubmit=event=>{
     event.preventDefault();
     const values=new FormData(form);
     const productIds=values.getAll('product');
     const minimumPrices=Object.fromEntries(productIds.filter(id=>values.get('floor-'+id)).map(id=>[id,Math.round(Number(values.get('floor-'+id))*100)]));
     change(state,{action:'enable',productIds,minimumPrices,discountPercent:Number(values.get('discountPercent')),durationMinutes:Number(values.get('durationMinutes')),confirmed:values.has('confirmed')});
    };
   }
   if(!dialog.open){document.body.append(dialog);dialog.showModal()}
  }
  async function refresh(){
   const state=context();
   if(!state.token||!state.restaurantId){if(dialog.open)dialog.close();clearNotice();return}
   if(current&&!matches(current)){if(dialog.open)dialog.close();clearNotice()}
   if(pending)return;
   current=state;
   const sequence=++request;
   try {
    const response=await api('/ai-price-actions?restaurantId='+encodeURIComponent(state.restaurantId));
    if(!matches(state)||pending||sequence!==request)return;
    setPrices(response.prices||[]);
    const next=JSON.stringify([response.actions,response.rule,response.linked]);
    if(next===signature)return;
    signature=next;root.replaceChildren();
    settings.hidden=!response.canManage;
    settings.onclick=response.canManage?()=>open(state,response.rule,response.linked):null;
    for(const action of response.actions){
     const row=document.createElement('p');
     row.textContent='Bringness AI: '+action.product_name+' von '+format.format(action.regular_cents/100)+' auf '+format.format(action.action_cents/100)+' · kurze Resthaltbarkeit · bis '+formatTime.format(new Date(action.ends_at))+' Uhr ';
     if(response.canManage)row.append(button('Rückgängig',()=>change(state,{action:'undo',id:action.id})));
     root.append(row);
    }
    root.hidden=!root.childElementCount;
   } catch(error){
    if(matches(state)&&sequence===request&&[401,403,404].includes(error.status))clearNotice();
   }
  }
  setInterval(()=>{if(!document.hidden)refresh()},10000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh()});
  window.bnPosAiPrices.refresh=refresh;
  return refresh;
 }};
})();
