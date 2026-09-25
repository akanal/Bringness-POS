(()=>{
  const remove=()=>document.querySelectorAll('[data-history-note]').forEach(x=>x.remove());
  const observer=new MutationObserver(remove);
  observer.observe(document.documentElement,{subtree:true,childList:true});
  remove();
})();