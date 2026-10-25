// Only authenticated record references; never session tokens or capabilities.
export function mountReferenceField(host,{value,label}){
 const input=document.createElement('input');input.readOnly=true;input.value=value;input.className='record-reference';input.setAttribute('aria-label',label);
 const button=document.createElement('button');button.type='button';button.className='outline';button.textContent=label+' kopieren';
 const status=document.createElement('p');status.className='muted';status.setAttribute('role','status');
 button.onclick=async()=>{input.focus();input.select();try{if(!window.navigator.clipboard?.writeText)throw Error('unavailable');await window.navigator.clipboard.writeText(value);if(input.isConnected)status.textContent=label+' kopiert.';}catch{if(input.isConnected)status.textContent=label+' markiert. Bitte über die Kopierfunktion deines Geräts kopieren.';}};
 host.append(input,button,status);return input;
}
