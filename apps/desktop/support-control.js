document.getElementById('mode').textContent=new URLSearchParams(location.search).get('mode')==='control'?'Bildschirm und Kassenbedienung freigegeben · maximal 15 Minuten':'Nur Bildschirmansicht · maximal 15 Minuten';
document.getElementById('stop').onclick=()=>window.bringnessSupport.stop();

const params=new URLSearchParams(location.search);
const revoke=document.getElementById('revoke');revoke.hidden=params.get('persistent')!=='1'||params.get('canGrant')!=='1';revoke.onclick=()=>window.bringnessSupport.revoke();
if(params.get('persistent')==='1')document.getElementById('mode').textContent+=' · Dauerhafte Gerätefreigabe aktiv';
