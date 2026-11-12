import crypto from 'node:crypto';
const fail=message=>{throw Object.assign(Error(message),{status:400})};
export const rosterUuid=value=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value);
export const rosterDate=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
export const addDays=(day,n)=>new Date(Date.parse(day+'T00:00:00Z')+n*86400000).toISOString().slice(0,10);
export const weekday=day=>new Date(day+'T00:00:00Z').getUTCDay();
const formatters=new Map(),conversions=new Map();
export function localParts(value,zone){let f=formatters.get(zone);if(!f){if(formatters.size>40)formatters.clear();f=new Intl.DateTimeFormat('sv-SE',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});formatters.set(zone,f)}return Object.fromEntries(f.formatToParts(new Date(value)).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));}
export function localDay(value,zone){const p=localParts(value,zone);return p.year+'-'+p.month+'-'+p.day;}
export function nextMonday(value,zone){const day=localDay(value,zone),d=weekday(day);return addDays(day,d===1?7:(8-d)%7);}
const time=value=>typeof value==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(value);
const minutes=value=>Number(value.slice(0,2))*60+Number(value.slice(3));
export function zonedInstant(day,clock,zone){
 if(!rosterDate(day)||!time(clock))fail('Datum und Uhrzeit bitte als gültiges Datum und HH:MM eingeben.');
 const key=zone+'|'+day+'|'+clock;if(conversions.has(key))return conversions.get(key);
 const [y,m,d]=day.split('-').map(Number),[h,min]=clock.split(':').map(Number),target=Date.UTC(y,m-1,d,h,min);let value=target;
 for(let i=0;i<4;i++){const p=localParts(value,zone),seen=Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute),diff=target-seen;value+=diff;if(!diff)break;}
 const matches=[];for(const delta of [-7200000,-3600000,0,3600000,7200000]){const v=value+delta,p=localParts(v,zone);if(p.year+'-'+p.month+'-'+p.day===day&&p.hour+':'+p.minute===clock)matches.push(v);}
 const unique=[...new Set(matches)];if(unique.length!==1)fail('Diese Ortszeit ist wegen der Zeitumstellung ungültig oder doppeldeutig. Bitte eine eindeutige Uhrzeit wählen.');
 const result=new Date(unique[0]).toISOString();if(conversions.size>4000)conversions.clear();conversions.set(key,result);return result;
}
export function weeklyInterval(day,start,end,zone){return {starts_at:zonedInstant(day,start,zone),ends_at:zonedInstant(addDays(day,minutes(end)<=minutes(start)?1:0),end,zone)};}
function cleanText(value,max=80){if(typeof value!=='string'||!value.trim()||value.length>max||/[\x00-\x1f\x7f]/.test(value))fail('Ungültige Planungsangabe.');return value.trim();}
function skills(value){if(!Array.isArray(value)||value.length>10)fail('Höchstens zehn Qualifikationen angeben.');return [...new Set(value.map(v=>cleanText(v,40).toLocaleLowerCase('de-DE')))].sort();}
function windowInput(row,maximum=480){if(!row||!Number.isInteger(row.weekday)||row.weekday<0||row.weekday>6||!time(row.start)||!time(row.end))fail('Wochentag und Zeitfenster prüfen.');const duration=(minutes(row.end)-minutes(row.start)+1440)%1440||(maximum===1440?1440:0);if(!duration||duration>maximum)fail('Ein Zeitfenster muss zwischen einer Minute und acht Stunden liegen. Längere Öffnungszeiten in Schichten aufteilen.');return {weekday:row.weekday,start:row.start,end:row.end};}
function overlapWindows(a,b){const start=a.weekday*1440+minutes(a.start),end=start+((minutes(a.end)-minutes(a.start)+1440)%1440||1440),other=b.weekday*1440+minutes(b.start),otherEnd=other+((minutes(b.end)-minutes(b.start)+1440)%1440||1440);return [-10080,0,10080].some(n=>start<otherEnd+n&&end>other+n);}
export function normalizeRosterPolicy(value){
 if(!value||typeof value.enabled!=='boolean'||typeof value.timezone!=='string'||value.timezone.length>80)fail('Planungsmodus und Zeitzone prüfen.');try{localParts(Date.now(),value.timezone)}catch{fail('Ungültige Betriebszeitzone.');}
 if(!Array.isArray(value.needs)||value.needs.length>40||!Array.isArray(value.profiles)||value.profiles.length>100)fail('Maximal 40 Besetzungszeiten und 100 Mitarbeiterprofile möglich.');
 const needs=value.needs.map(row=>{if(!rosterUuid(row.id)||!Number.isInteger(row.count)||row.count<1||row.count>20)fail('Besetzungskennung und Anzahl prüfen.');return {id:row.id.toLowerCase(),...windowInput(row),role:cleanText(row.role,40),count:row.count,skills:skills(row.skills||[])};});
 if(new Set(needs.map(n=>n.id)).size!==needs.length||needs.reduce((n,x)=>n+x.count,0)>200)fail('Doppelte Besetzungskennung oder mehr als 200 Dienste je Woche.');
 if(needs.some((a,i)=>needs.slice(i+1).some(b=>a.role===b.role&&a.weekday===b.weekday&&a.start===b.start&&a.end===b.end&&JSON.stringify(a.skills)===JSON.stringify(b.skills))))fail('Identische Besetzungszeiten und Qualifikationen bitte zusammenfassen.');
 const profiles=value.profiles.map(p=>{if(!rosterUuid(p.employeeId)||typeof p.enabled!=='boolean'||!Array.isArray(p.windows)||p.windows.length>21)fail('Mitarbeiter und Verfügbarkeit prüfen.');const windows=p.windows.map(row=>windowInput(row,1440));if(windows.some((a,i)=>windows.slice(i+1).some(b=>overlapWindows(a,b))))fail('Verfügbarkeitszeiten eines Mitarbeiters überschneiden sich.');return {employeeId:p.employeeId.toLowerCase(),enabled:p.enabled,skills:skills(p.skills||[]),windows};});
 if(new Set(profiles.map(p=>p.employeeId)).size!==profiles.length)fail('Mitarbeiterprofil doppelt.');if(value.enabled&&!needs.length)fail('Zuerst mindestens eine Besetzungszeit festlegen.');
 return {enabled:value.enabled,timezone:value.timezone,needs,profiles};
}
const start=s=>Date.parse(s.starts_at??s.startsAt),end=s=>Date.parse(s.ends_at??s.endsAt);
const intersect=(a,b)=>start(a)<end(b)&&start(b)<end(a);
const employeeId=s=>s.employee_id??s.employeeId;
export function assignmentProblem(person,slot,context,{manual=false}={}){
 const {policy,people,absences=[],existing=[],slots=[]}=context,a=start(slot),b=end(slot),zone=policy.timezone;
 if(!Number.isFinite(a)||!Number.isFinite(b)||b<=a||(b-a)>8*3600000)return 'Dienstzeit ungültig oder länger als acht Stunden.';
 if(!person?.active||person.role!==slot.role)return 'Mitarbeiter ist nicht aktiv oder hat eine andere Rolle.';
 const profile=policy.profiles.find(p=>p.employeeId===person.id);
 if(!manual&&(!profile?.enabled||!profile.windows.length))return 'Nicht für automatische Planung verfügbar.';
 if((slot.skills||[]).some(s=>!profile?.skills.includes(s)))return 'Benötigte Qualifikation fehlt.';
 if(profile?.windows.length){const day=localDay(a,zone);const allowed=profile.windows.some(w=>[day,addDays(day,-1)].some(date=>{if(weekday(date)!==w.weekday)return false;try{const bounds=weeklyInterval(date,w.start,w.end,zone);return start(bounds)<=a&&end(bounds)>=b}catch{return false}}));if(!allowed)return 'Außerhalb der hinterlegten Verfügbarkeit.';}
 if(absences.some(x=>x.employee_id===person.id&&x.state==='approved'&&Date.parse(x.starts_at)<b&&(x.ends_at?Date.parse(x.ends_at):Infinity)>a))return 'Genehmigte Abwesenheit oder Krankmeldung.';
 const others=[...existing.filter(s=>s.coverage_state!=='open'),...slots.filter(s=>s.employeeId)].filter(s=>employeeId(s)===person.id&&(!slot.id||s.id!==slot.id)&&(!slot.replacesShiftId||s.id!==slot.replacesShiftId)&&(!slot.key||s.key!==slot.key));
 if(others.some(s=>start(s)<b+11*3600000&&end(s)>a-11*3600000))return 'Zeitüberschneidung oder weniger als elf Stunden Abstand.';
 // A conservative planning policy, not a statement of legal certification.
 for(let day=localDay(a,zone),last=localDay(b-1,zone);day<=last;day=addDays(day,1)){
  const lo=Date.parse(zonedInstant(day,'00:00',zone)),hi=Date.parse(zonedInstant(addDays(day,1),'00:00',zone));
  const hours=others.reduce((n,s)=>n+Math.max(0,Math.min(end(s),hi)-Math.max(start(s),lo)),Math.max(0,Math.min(b,hi)-Math.max(a,lo)))/3600000;
  if(hours>8+1e-9)return 'Mehr als acht geplante Stunden an einem Betriebstag.';
 }
 for(let monday=addDays(localDay(a,zone),-((weekday(localDay(a,zone))+6)%7)),last=localDay(b-1,zone);monday<=last;monday=addDays(monday,7)){
  const lo=Date.parse(zonedInstant(monday,'00:00',zone)),hi=Date.parse(zonedInstant(addDays(monday,7),'00:00',zone));
  const hours=others.reduce((n,s)=>n+Math.max(0,Math.min(end(s),hi)-Math.max(start(s),lo)),Math.max(0,Math.min(b,hi)-Math.max(a,lo)))/3600000;
  if(hours>40+1e-9)return 'Mehr als 40 geplante Stunden in der Kalenderwoche.';
 }
 return null;
}
export function rosterContextHash(context){
 const pick=(rows,keys)=>rows.map(row=>Object.fromEntries(keys.map(k=>[k,row[k]??null]))).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
 return crypto.createHash('sha256').update(JSON.stringify({policy:context.policy,version:context.version,people:pick(context.people,['id','role','active']),existing:pick(context.existing,['id','employee_id','starts_at','ends_at','coverage_state','manual_lock','planner_revision','planner_key']),absences:pick(context.absences,['id','employee_id','starts_at','ends_at','state']),patterns:context.patterns,exceptions:context.exceptions})).digest('hex');
}
export function makeRosterProposal(context,week,{manualSlots=[],now=Date.now()}={}){
 if(!rosterDate(week)||weekday(week)!==1)fail('Wochenbeginn muss ein Montag sein.');const zone=context.policy.timezone,slots=[],issues=[],coverage=[];
 const add=slot=>{if(slots.some(s=>s.key===slot.key))return;const person=context.people.find(p=>p.id===slot.employeeId);const reason=slot.employeeId?assignmentProblem(person,slot,{...context,slots},{manual:slot.manual}):slot.reason||'Kein passender Mitarbeiter verfügbar.';slots.push({...slot,reason:reason||null});};
 for(const value of manualSlots){if(value&&typeof value.key==='string'&&value.key.length<=180&&start(value)>now&&localDay(start(value),zone)>=week&&localDay(start(value),zone)<addDays(week,7))add({...value,manual:true});}
 for(const pattern of context.patterns||[]){for(let n=0;n<7;n++){
  const day=addDays(week,n);if(weekday(day)!==pattern.weekday||day<pattern.from_date||(pattern.until_date&&day>pattern.until_date)||(context.exceptions||[]).some(x=>(x.pattern_id===pattern.id||(x.source_base&&x.source_base===pattern.source_base))&&x.occurrence===day))continue;
  const key='pattern:'+pattern.id+':'+day;if(slots.some(s=>s.key===key||(s.patternId===pattern.id&&s.occurrence===day)))continue;
  let bounds;try{bounds=weeklyInterval(day,pattern.start_time,pattern.end_time,zone)}catch(error){issues.push(day+': '+error.message);continue;}
  if(start(bounds)<=now||context.existing.some(s=>s.coverage_state!=='open'&&s.employee_id===pattern.employee_id&&start(s)===start(bounds)&&end(s)===end(bounds)))continue;
  add({key,employeeId:pattern.employee_id,...{startsAt:bounds.starts_at,endsAt:bounds.ends_at},role:pattern.role,skills:pattern.skills||[],manual:true,patternId:pattern.id,occurrence:day});
 }}
 for(let n=0;n<7;n++){const day=addDays(week,n);for(const need of context.policy.needs.filter(x=>x.weekday===weekday(day)).sort((a,b)=>b.skills.length-a.skills.length||a.id.localeCompare(b.id))){
  let bounds;try{bounds=weeklyInterval(day,need.start,need.end,zone)}catch(error){issues.push(day+': '+error.message);continue;}if(start(bounds)<=now)continue;
  const covers=s=>{const p=context.people.find(p=>p.id===employeeId(s));return (!Object.hasOwn(s,'coverage_state')||p?.active)&&start(s)<=start(bounds)&&end(s)>=end(bounds)&&(s.role||p?.role)===need.role&&need.skills.every(tag=>(p?context.policy.profiles.find(x=>x.employeeId===p.id)?.skills||[]:s.skills||[]).includes(tag));};
  const assigned=context.existing.filter(s=>s.coverage_state!=='open'&&covers(s)&&!context.absences.some(a=>a.employee_id===s.employee_id&&a.state==='approved'&&Date.parse(a.starts_at)<end(bounds)&&(a.ends_at?Date.parse(a.ends_at):Infinity)>start(bounds)));
  const fixed=slots.filter(covers),used=new Set();let covered=0;for(const value of [...assigned,...fixed]){const who=employeeId(value)||value.key;if(used.has(who)||coverage.some(x=>x.who===who&&intersect(x,bounds)))continue;used.add(who);coverage.push({who,starts_at:bounds.starts_at,ends_at:bounds.ends_at});covered++;if(covered>=need.count)break;}let missing=Math.max(0,need.count-covered);
  for(let i=0;missing>0&&i<need.count+200;i++){
   const key='need:'+need.id+':'+day+':'+i;if(slots.some(s=>s.key===key))continue;
   const replacement=context.existing.find(s=>s.coverage_state==='open'&&s.planner_key===key&&start(s)===start(bounds)&&end(s)===end(bounds));
   const value={key,employeeId:null,startsAt:bounds.starts_at,endsAt:bounds.ends_at,role:need.role,skills:need.skills,manual:false,...(replacement?{replacesShiftId:replacement.id}:{})};
   const checked=context.people.map(p=>({person:p,problem:assignmentProblem(p,value,{...context,slots})})),candidates=checked.filter(x=>!x.problem).map(x=>x.person);if(!candidates.length)value.reason=[...new Set(checked.map(x=>x.problem))].slice(0,3).join(' ')||'Kein aktiver Mitarbeiter vorhanden.';
   const workload=id=>[...context.existing.filter(s=>s.coverage_state!=='open'),...slots].filter(s=>employeeId(s)===id).reduce((total,s)=>total+(end(s)-start(s))/3600000,0);
   candidates.sort((a,b)=>(context.policy.profiles.find(p=>p.employeeId===a.id)?.skills.length||0)-(context.policy.profiles.find(p=>p.employeeId===b.id)?.skills.length||0)||workload(a.id)-workload(b.id)||a.id.localeCompare(b.id));value.employeeId=candidates[0]?.id||null;add(value);coverage.push({who:value.employeeId||value.key,starts_at:value.startsAt,ends_at:value.endsAt});missing--;
  }
 }}
 if(slots.length>400)fail('Zu viele Dienste für einen Vorschlag. Besetzungszeiten reduzieren.');
 return {week,timezone:zone,slots,issues,openCount:slots.filter(s=>!s.employeeId||s.reason).length};
}
