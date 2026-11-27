export function safeLink(value){try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password;}catch{return false;}}
export function renderAdvertisements(host,ads){
  host.replaceChildren();
  for(const ad of ads.slice(0,6)){
    if(!safeLink(ad.link)||!/^data:image\/(png|jpeg|webp);base64,/.test(ad.image))continue;
    const card=document.createElement('article');card.className='campaign-tile';
    const link=document.createElement('a');link.href=ad.link;link.rel='sponsored noopener noreferrer';link.referrerPolicy='no-referrer';
    const label=document.createElement('small');label.textContent='Werbung';
    const img=document.createElement('img');img.src=ad.image;img.alt='';img.loading='lazy';
    const title=document.createElement('strong');title.textContent=ad.title;
    const caption=document.createElement('p');caption.textContent=ad.caption;
    const action=document.createElement('span');action.textContent='Zum Angebot';
    link.append(label,img,title,caption,action);card.append(link);host.append(card);
  }
  host.hidden=!host.childElementCount;
}
