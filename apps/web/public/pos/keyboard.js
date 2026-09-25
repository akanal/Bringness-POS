(()=>{
  const style=document.createElement('style');
  style.textContent=`
  .bringness-kbd-toggle{position:fixed;right:18px;bottom:18px;z-index:9998;border:0;border-radius:999px;background:#07182c;color:#fff;padding:13px 17px;font-weight:800;box-shadow:0 10px 30px #07182c33;cursor:pointer}
  .bringness-kbd{position:fixed;left:0;right:0;bottom:0;z-index:9999;background:#f7f9fb;border-top:1px solid #d8e0e8;box-shadow:0 -12px 30px #07182c22;padding:10px 12px calc(10px + env(safe-area-inset-bottom));display:none}
  .bringness-kbd.show{display:block}.bringness-kbd-head{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:8px}.bringness-kbd-head b{font-size:14px}.bringness-kbd-close{border:0;background:#e9eef3;border-radius:8px;padding:8px 12px;font-weight:800;cursor:pointer}
  .bringness-kbd-rows{display:grid;gap:7px}.bringness-kbd-row{display:flex;gap:7px;justify-content:center}.bringness-kbd-key{min-width:46px;min-height:46px;padding:8px 12px;border:1px solid #cfd9e2;border-radius:9px;background:#fff;color:#10263c;font-size:18px;font-weight:750;box-shadow:0 1px 2px #0000000d;cursor:pointer}.bringness-kbd-key:active{transform:translateY(1px);background:#eef3f7}.bringness-kbd-key.wide{min-width:86px}.bringness-kbd-key.space{flex:1;max-width:430px}.bringness-kbd-key.action{background:#07182c;color:#fff;border-color:#07182c}.bringness-kbd-key.orange{background:#ff7628;color:#fff;border-color:#ff7628}
  body.bringness-kbd-open{padding-bottom:250px}
  @media(max-width:760px){.bringness-kbd-key{min-width:30px;min-height:42px;padding:7px;font-size:16px}.bringness-kbd-key.wide{min-width:62px}.bringness-kbd-toggle{right:10px;bottom:10px}.bringness-kbd{padding-left:6px;padding-right:6px}}
  `;
  document.head.appendChild(style);

  let target=null,shift=false;
  const wrap=document.createElement('div');
  wrap.className='bringness-kbd';
  wrap.innerHTML='<div class="bringness-kbd-head"><b>Bildschirmtastatur</b><button type="button" class="bringness-kbd-close">Schließen</button></div><div class="bringness-kbd-rows"></div>';
  const rows=wrap.querySelector('.bringness-kbd-rows');
  document.body.appendChild(wrap);

  const toggle=document.createElement('button');
  toggle.type='button';toggle.className='bringness-kbd-toggle';toggle.textContent='⌨ Tastatur';toggle.setAttribute('aria-label','Bildschirmtastatur öffnen');
  document.body.appendChild(toggle);

  const layout=[
    ['1','2','3','4','5','6','7','8','9','0','⌫'],
    ['q','w','e','r','t','z','u','i','o','p','ü'],
    ['a','s','d','f','g','h','j','k','l','ö','ä'],
    ['⇧','y','x','c','v','b','n','m','-','.',','],
    ['Tab','Leer','Enter']
  ];
  function rebuild(){
    rows.innerHTML='';
    layout.forEach((r,ri)=>{const row=document.createElement('div');row.className='bringness-kbd-row';r.forEach(k=>{const b=document.createElement('button');b.type='button';b.className='bringness-kbd-key';if(['⌫','⇧','Tab','Enter'].includes(k))b.classList.add('wide');if(k==='Leer')b.classList.add('space');if(k==='Enter')b.classList.add('orange');if(k==='⇧'&&shift)b.classList.add('action');b.textContent=(shift&&k.length===1)?k.toUpperCase():k;b.onclick=()=>press(k);row.appendChild(b)});rows.appendChild(row)});
  }
  function editable(el){return el instanceof HTMLInputElement||el instanceof HTMLTextAreaElement||el?.isContentEditable}
  function put(text){if(!target||!editable(target))return;if(target instanceof HTMLInputElement||target instanceof HTMLTextAreaElement){const s=target.selectionStart??target.value.length,e=target.selectionEnd??target.value.length;target.setRangeText(text,s,e,'end');target.dispatchEvent(new Event('input',{bubbles:true}));target.focus()}else{document.execCommand('insertText',false,text)}}
  function press(k){
    if(k==='⇧'){shift=!shift;rebuild();return}
    if(k==='⌫'){if(!target)return;if(target instanceof HTMLInputElement||target instanceof HTMLTextAreaElement){const s=target.selectionStart??target.value.length,e=target.selectionEnd??target.value.length;if(s!==e)target.setRangeText('',s,e,'end');else if(s>0)target.setRangeText('',s-1,s,'end');target.dispatchEvent(new Event('input',{bubbles:true}));target.focus()}return}
    if(k==='Leer'){put(' ');return}
    if(k==='Tab'){put('\t');return}
    if(k==='Enter'){if(target instanceof HTMLTextAreaElement||target?.isContentEditable){put('\n')}else{target?.form?.requestSubmit?.()}return}
    put(shift?k.toUpperCase():k);if(shift){shift=false;rebuild()}
  }
  function open(){wrap.classList.add('show');document.body.classList.add('bringness-kbd-open');toggle.textContent='⌨ Tastatur schließen'}
  function close(){wrap.classList.remove('show');document.body.classList.remove('bringness-kbd-open');toggle.textContent='⌨ Tastatur'}
  toggle.onclick=()=>wrap.classList.contains('show')?close():open();wrap.querySelector('.bringness-kbd-close').onclick=close;
  document.addEventListener('focusin',e=>{if(editable(e.target)){target=e.target;open()}},true);
  rebuild();
})();
