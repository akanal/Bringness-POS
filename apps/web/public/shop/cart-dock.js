// Non-modal browsing surface. Account checks remain in their explicit review dialog.
export function mountCartDock({dialog,trigger,minimize,summary,document:d=dialog.ownerDocument}){
 let collapsed=false;
 const sync=()=>{d.body.classList.toggle('cart-dock-open',dialog.open);d.body.classList.toggle('cart-dock-collapsed',dialog.open&&collapsed);trigger.setAttribute('aria-expanded',String(dialog.open));minimize.setAttribute('aria-expanded',String(!collapsed));minimize.textContent=collapsed?'Vergrößern':'Verkleinern';dialog.classList.toggle('is-collapsed',collapsed);};
 const open=()=>{if(dialog.open){collapsed=false;sync();return;}collapsed=false;dialog.setAttribute('aria-modal','false');if(typeof dialog.show==='function')dialog.show();else dialog.setAttribute('open','');sync();};
 const close=()=>{if(dialog.open)dialog.close();sync();};
 const onClose=()=>{collapsed=false;sync();};const onMinimize=()=>{collapsed=!collapsed;sync();};
 const onKey=event=>{if(event.key!=='Escape'||!dialog.open||d.querySelector('dialog[open]:not(#cart-dialog)'))return;event.preventDefault();close();trigger.focus({preventScroll:true});};
 dialog.addEventListener('close',onClose);minimize.addEventListener('click',onMinimize);d.addEventListener('keydown',onKey);trigger.setAttribute('aria-controls',dialog.id);sync();
 return {open,close,toggle(){if(dialog.open)close();else open();},updateCount(count){summary.textContent=count===1?'1 Artikel':count+' Artikel';},dispose(){dialog.removeEventListener('close',onClose);minimize.removeEventListener('click',onMinimize);d.removeEventListener('keydown',onKey);d.body.classList.remove('cart-dock-open','cart-dock-collapsed');}};
}
