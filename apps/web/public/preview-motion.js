(()=>{
  const stage=document.getElementById('posPreview'),button=document.getElementById('previewMotionToggle');
  if(!stage||!button)return;
  const preference=window.matchMedia('(prefers-reduced-motion: reduce)');
  let paused=false,inView=true;
  function update(){
    stage.classList.toggle('motion-reduced',preference.matches);
    stage.classList.toggle('motion-paused',paused||document.hidden||!inView);
    button.hidden=preference.matches;
    button.setAttribute('aria-pressed',String(paused));
    button.textContent=paused?'Animation fortsetzen':'Animation pausieren';
  }
  button.addEventListener('click',()=>{paused=!paused;update()});
  document.addEventListener('visibilitychange',update);
  preference.addEventListener?.('change',update);
  if('IntersectionObserver'in window)new IntersectionObserver(entries=>{inView=entries[0].isIntersecting;update()},{threshold:.05}).observe(stage);
  update();
})();
