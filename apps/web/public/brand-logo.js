(()=>{
  const src='/assets/bringness-logo.png';

  function forceVisibleAuthWhenLoggedOut(){
    const token=localStorage.getItem('bringness-pos-token');
    const auth=document.getElementById('auth');
    const workspace=document.getElementById('workspace');
    if(!token){
      if(auth){
        auth.style.display='block';
        auth.hidden=false;
      }
      if(workspace){
        workspace.classList.remove('show');
        workspace.style.display='none';
      }
      document.body?.classList.remove('pos-loading');
    }
  }

  function apply(){
    const candidates=[...document.querySelectorAll('a.brand,.brand.home,header .brand')];
    for(const el of candidates){
      if(el.querySelector('img[data-bringness-logo]')) continue;
      const img=document.createElement('img');
      img.src=src; img.alt='Bringness'; img.dataset.bringnessLogo='1';
      img.style.cssText='display:block;height:42px;width:auto;max-width:220px;object-fit:contain';
      const pos=document.createElement('span');
      pos.textContent='– POS';
      pos.dataset.bringnessPosLabel='1';
      pos.style.cssText='font-size:15px;font-weight:800;letter-spacing:.04em;white-space:nowrap;color:currentColor;opacity:.82;margin-left:8px';
      el.textContent=''; el.appendChild(img); el.appendChild(pos);
      if(el.tagName==='A'&&!el.getAttribute('href')) el.setAttribute('href','/');
      el.style.display='inline-flex'; el.style.alignItems='center'; el.style.textDecoration='none'; el.style.gap='0';
    }
    forceVisibleAuthWhenLoggedOut();
  }

  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',apply):apply();
  new MutationObserver(apply).observe(document.documentElement,{childList:true,subtree:true});
})();