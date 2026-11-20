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
  function open(state,rule){
   if(!matches(state))return;
   const form=dialog.querySelector('form');
   form.replaceChildren();
   const heading=document.createElement('h2');
   heading.textContent='Automatische AI-Preisaktionen';
   form.append(heading);
   const close=button('Schließen',()=>dialog.close());
   form.onsubmit=event=>event.preventDefault();
   if(rule.enabled){
    const summary=document.createElement('p');
    summary.textContent=rule.product_ids.length+' freigegebene Artikel · '+rule.discount_percent+' % Rabatt · bis zu '+rule.duration_minutes+' Minuten';
    form.append(summary,button('Freigabe widerrufen',()=>change(state,{action:'disable'})),close);
   } else {
    const help=document.createElement('p');
    help.textContent='Bringness AI kann diese Artikel reduzieren, wenn geprüfte Zutaten am selben Tag ihr Mindesthaltbarkeitsdatum erreichen. Die Aktion endet spätestens um Mitternacht.';
    const choices=document.createElement('fieldset');
    const legend=document.createElement('legend');legend.textContent='Zugelassene Artikel';choices.append(legend);
    for(const product of products(state.restaurantId)){
     const label=document.createElement('label'), input=document.createElement('input');
     input.type='checkbox';input.name='product';input.value=product.id;
     label.append(input,document.createTextNode(' '+product.name));choices.append(label,document.createElement('br'));
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
    form.append(help,choices,number('discountPercent','Rabatt in Prozent',1,50,rule.discount_percent),number('durationMinutes','Minuten',15,240,rule.duration_minutes),confirmLabel,save,close);
    form.onsubmit=event=>{
     event.preventDefault();
     const values=new FormData(form);
     change(state,{action:'enable',productIds:values.getAll('product'),discountPercent:Number(values.get('discountPercent')),durationMinutes:Number(values.get('durationMinutes')),confirmed:values.has('confirmed')});
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
    const next=JSON.stringify([response.actions,response.rule]);
    if(next===signature)return;
    signature=next;root.replaceChildren();
    settings.hidden=!response.canManage;
    settings.onclick=response.canManage?()=>open(state,response.rule):null;
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
