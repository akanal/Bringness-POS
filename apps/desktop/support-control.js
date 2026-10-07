document.getElementById('mode').textContent=new URLSearchParams(location.search).get('mode')==='control'?'Bildschirm und Kassenbedienung freigegeben · maximal 15 Minuten':'Nur Bildschirmansicht · maximal 15 Minuten';
document.getElementById('stop').onclick=()=>window.bringnessSupport.stop();
