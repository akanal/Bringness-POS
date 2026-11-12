(()=>{
 const q=id=>document.getElementById(id),allowed=[5,15,30,60,120];
 let employee=null,scope=null,shift=null,clockOffset=0,preferences={enabled:false,minutes:15},warned=new Set();
 const now=()=>Date.now()+clockOffset;
 const formatDate=value=>new Date(value).toLocaleString('de-DE',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
 const preferenceKey=()=> 'bringness-waiter-alarm:'+scope;
 function validShift(s){return s&&s.coverage_state!=='open'&&Number.isFinite(Date.parse(s.starts_at))&&Number.isFinite(Date.parse(s.ends_at))&&Date.parse(s.ends_at)>now()&&Date.parse(s.ends_at)>Date.parse(s.starts_at);}
 function status(){q('armShiftAlarm').textContent=preferences.enabled?'Wecker ausschalten':'Wecker aktivieren';q('shiftAlarmStatus').textContent=preferences.enabled?'App-Wecker aktiviert: '+preferences.minutes+' Minuten vor Dienstbeginn.':'App-Wecker ist ausgeschaltet.';}
 function save(next){try{localStorage.setItem(preferenceKey(),JSON.stringify(next));preferences=next;status();return true}catch{q('shiftAlarmStatus').textContent='Wecker kann auf diesem Gerät nicht gespeichert werden.';return false}}
 function render(){
  if(!employee)return;
  if(shift&&!validShift(shift)){shift=null;q('nextShiftDate').textContent='';q('shiftCountdown').textContent='--:--:--';q('shiftState').textContent='Dienst beendet. Der nächste Dienst wird abgefragt.';q('armShiftAlarm').disabled=q('exportShiftAlarm').disabled=true;return;}
  if(!shift)return;
  const seconds=Math.max(0,Math.ceil((Date.parse(shift.starts_at)-now())/1000)),days=Math.floor(seconds/86400),part=seconds%86400;
  q('shiftCountdown').textContent=(days?days+' Tag'+(days===1?'':'e')+' · ':'')+[Math.floor(part/3600),Math.floor(part/60)%60,part%60].map(n=>String(n).padStart(2,'0')).join(':');
  q('armShiftAlarm').disabled=q('exportShiftAlarm').disabled=seconds===0;
  q('shiftState').textContent=employee.duty_state==='paused'?'Du bist in Pause. Deinen Dienst setzt du an der Kasse fort.':seconds===0?'Dein Dienst hat begonnen. Bitte im Betrieb an der Kasse einstempeln.':'';
  if(preferences.enabled&&now()>=Date.parse(shift.starts_at)-preferences.minutes*60000&&now()<Date.parse(shift.starts_at)){
   const key=scope+':'+shift.id+':'+shift.starts_at+':'+preferences.minutes;
   let previous=false;try{previous=sessionStorage.getItem('bringness-waiter-alarm-fired:'+key)==='1'}catch{}
   if(!previous&&!warned.has(key)){
    warned.add(key);try{sessionStorage.setItem('bringness-waiter-alarm-fired:'+key,'1')}catch{}
    q('shiftAlarmStatus').textContent='Wecker: Dein Dienst beginnt um '+formatDate(shift.starts_at)+'.';q('shiftAlarm').open=true;
    window.bnRingWaiterAlarm?.();
   }
  }
 }
 function update(boot,shifts,error=''){
  const nextScope=boot.employee.restaurant_id+':'+boot.employee.id;
  if(scope!==nextScope){scope=nextScope;shift=null;warned=new Set();preferences={enabled:false,minutes:15};try{const value=JSON.parse(localStorage.getItem(preferenceKey())||'null');if(value&&typeof value.enabled==='boolean'&&allowed.includes(value.minutes))preferences=value}catch{}q('alarmMinutes').value=String(preferences.minutes);status();}
  employee=boot.employee;
  if(Number.isFinite(Date.parse(boot.serverTime)))clockOffset=Date.parse(boot.serverTime)-Date.now();
  if(Array.isArray(shifts))shift=shifts.filter(validShift).sort((a,b)=>Date.parse(a.starts_at)-Date.parse(b.starts_at))[0]||null;
  if(error)shift=null;
  q('armShiftAlarm').disabled=q('exportShiftAlarm').disabled=!shift;
  q('nextShiftDate').textContent=shift?formatDate(shift.starts_at):'';
  if(!shift){q('shiftCountdown').textContent='--:--:--';q('shiftState').textContent=error?'Dienstplan gerade nicht erreichbar. Bitte unter Mehr aktualisieren.':Array.isArray(shifts)?'Noch kein nächster Dienst geplant.':'Dienstplan wird geladen…';}
  render();
 }
 const escape=s=>String(s??'').replace(/[\r\n]+/g,' ').replace(/[\\;,]/g,'\\$&').replace(/[\x00-\x1f\x7f]/g,'');
 const fold=line=>{let result='',width=0;for(const char of line){const cp=char.codePointAt(0),bytes=cp<=127?1:cp<=2047?2:cp<=65535?3:4;if(width+bytes>75){result+='\r\n ';width=1}result+=char;width+=bytes}return result};
 const stamp=value=>new Date(value).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');
 function calendar(){
  if(!shift||!validShift(shift)||Date.parse(shift.starts_at)<=now())throw Error('Kein zukünftiger Dienst vorhanden.');
  const minutes=Number(q('alarmMinutes').value);if(!allowed.includes(minutes))throw Error('Erinnerungszeit auswählen.');
  return ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Bringness//Dienstwecker//DE','CALSCALE:GREGORIAN','BEGIN:VEVENT','UID:'+escape(shift.id||shift.starts_at)+'-'+escape(employee.id)+'@bringness.de','DTSTAMP:'+stamp(now()),'DTSTART:'+stamp(shift.starts_at),'DTEND:'+stamp(shift.ends_at),'SUMMARY:'+escape('Dienstbeginn · '+employee.restaurant_name),'DESCRIPTION:Im Betrieb an der Kasse einstempeln. Dienständerungen bitte im Dienstplan prüfen.','BEGIN:VALARM','TRIGGER:-PT'+minutes+'M','ACTION:DISPLAY','DESCRIPTION:Dienst beginnt in '+minutes+' Minuten.','END:VALARM','END:VEVENT','END:VCALENDAR',''].map(fold).join('\r\n');
 }
 q('armShiftAlarm').onclick=()=>{if(!shift||Date.parse(shift.starts_at)<=now())return;const minutes=Number(q('alarmMinutes').value);if(!allowed.includes(minutes))return;if(save({enabled:!preferences.enabled,minutes})){if(preferences.enabled)window.bnUnlockWaiterAlarm?.();render()}};
 q('alarmMinutes').onchange=()=>{const minutes=Number(q('alarmMinutes').value);if(employee&&allowed.includes(minutes)){save({...preferences,minutes});render()}};
 q('exportShiftAlarm').onclick=()=>{let url;try{const content=calendar();url=URL.createObjectURL(new Blob([content],{type:'text/calendar;charset=utf-8'}));const link=document.createElement('a');link.href=url;link.download='Bringness-Diensterinnerung.ics';document.body.append(link);link.click();link.remove();q('shiftAlarmStatus').textContent='Datei im Handy-Kalender öffnen und den Import mit Erinnerung bestätigen. Eine Kalender-Erinnerung ist erst nach dem Import eingerichtet.';}catch(error){q('shiftAlarmStatus').textContent=error.message}finally{if(url)setTimeout(()=>URL.revokeObjectURL(url),30000)}};
 window.bnWaiterStandby={update,render,calendar,clear(){employee=null;shift=null;scope=null;clockOffset=0;q('shiftCountdown').textContent='--:--:--';q('nextShiftDate').textContent='';q('shiftState').textContent='';q('shiftAlarm').open=false;}};
 setInterval(()=>{if(!document.hidden)render()},1000);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)render()});
})();
