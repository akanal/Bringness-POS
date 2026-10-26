// Presentation only: request, credential clearing and reveal lifecycle remain with each form.
export function paintPasswordEye(button,revealed=false){
 const d=button.ownerDocument,ns='http://www.w3.org/2000/svg',svg=d.createElementNS(ns,'svg');
 svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');svg.setAttribute('focusable','false');
 const path=d.createElementNS(ns,'path');path.setAttribute('d','M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z');
 const iris=d.createElementNS(ns,'circle');iris.setAttribute('cx','12');iris.setAttribute('cy','12');iris.setAttribute('r','3');svg.append(path,iris);
 if(revealed){const slash=d.createElementNS(ns,'path');slash.setAttribute('d','M4 3 20 21');svg.append(slash);}
 const label=d.createElement('span');label.className='sr-only';label.textContent=revealed?'Passwort verbergen':'Passwort anzeigen';button.classList.add('password-eye');button.title=label.textContent;button.setAttribute('aria-label',label.textContent);button.setAttribute('aria-pressed',String(revealed));button.replaceChildren(svg,label);
}
export function placePasswordEye(input,button){
 const d=input.ownerDocument,row=d.createElement('div');row.className='password-input-row';input.before(row);row.append(input,button);input.setAttribute('aria-label','Passwort');button.type='button';if(!input.id)input.id='shop-login-password';button.setAttribute('aria-controls',input.id);paintPasswordEye(button);
}
