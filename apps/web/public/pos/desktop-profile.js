(()=>{
  const params=new URLSearchParams(location.search);
  if(params.get("desktop")!=="1" && params.get("edition")!=="download") return;

  const blockedViews=new Set(["tische","bestellungen","kueche"]);
  const hide=(selector)=>document.querySelectorAll(selector).forEach(el=>el.remove());
  const sanitizeView=()=>{
    const current=new URL(location.href);
    const view=current.searchParams.get("view");
    if(blockedViews.has(view)){
      current.searchParams.delete("view");
      history.replaceState({},"",current.pathname+current.search+current.hash);
    }
  };

  document.documentElement.dataset.bringnessEdition="download";
  document.title="Bringness POS – Download-Kasse";
  sanitizeView();

  const apply=()=>{
    hide('#mainnav [data-view="tische"]');
    hide('#mainnav [data-view="bestellungen"]');
    hide('#mainnav [data-view="kueche"]');
    hide('#guestPresence');
    hide('#moreMenu a[href="/#downloads"]');

    const eyebrow=document.querySelector('#auth .eyebrow');
    if(eyebrow) eyebrow.textContent="Bringness POS – Download-Kasse";

    const waiter=document.querySelector('#employeeRole option[value="waiter"]');
    if(waiter) waiter.remove();

    document.querySelectorAll('[data-view]').forEach(el=>{
      if(blockedViews.has(el.dataset.view)) el.remove();
    });
  };

  document.addEventListener("click",event=>{
    const trigger=event.target.closest('[data-view]');
    if(trigger && blockedViews.has(trigger.dataset.view)){
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  },true);

  apply();
  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",apply,{once:true});
  const observer=new MutationObserver(apply);
  observer.observe(document.documentElement,{subtree:true,childList:true});
})();
