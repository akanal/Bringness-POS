// Monthly reporting uses Berlin calendar boundaries, including daylight saving.
export function monthWindow(month) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw Object.assign(Error('Monat im Format JJJJ-MM erforderlich'),{status:400});
  const [year,m]=month.split('-').map(Number);
  if(year<2000||year>2100) throw Object.assign(Error('Ungültiger Monat'),{status:400});
  const midnight=(y,mm)=>{
    const utc=Date.UTC(y,mm,1),parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Berlin',hour:'2-digit',hourCycle:'h23'}).formatToParts(new Date(utc));
    return utc-Number(parts.find(p=>p.type==='hour').value)*3600000;
  };
  return {from:midnight(year,m-1),to:midnight(year,m),timeZone:'Europe/Berlin'};
}
export function personnelReport(entries,people,month,now=Date.now()) {
  const window=monthWindow(month),limit=Math.min(window.to,now),rows=[];
  const totals=people.map(p=>({employeeId:p.id,name:p.display_name,workMinutes:0,pauseMinutes:0,openShifts:0}));
  for(const person of totals){
    const events=entries.filter(e=>e.employee_id===person.employeeId).sort((a,b)=>Date.parse(a.recorded_at)-Date.parse(b.recorded_at)||String(a.id).localeCompare(String(b.id)));
    let shift=null,state='off',at=null;
    const add=until=>{if(!shift||at===null)return;const minutes=Math.max(0,(Math.min(until,limit)-Math.max(at,window.from))/60000);if(state==='working')shift.workMinutes+=minutes;else if(state==='paused')shift.pauseMinutes+=minutes;};
    const finish=(end,open)=>{if(!shift)return;if((end??limit)>window.from&&shift.start<window.to){const row={employeeId:person.employeeId,name:person.name,start:new Date(shift.start).toISOString(),end:end===null?null:new Date(end).toISOString(),workMinutes:shift.workMinutes,pauseMinutes:shift.pauseMinutes,open,corrected:shift.corrected};rows.push(row);person.workMinutes+=row.workMinutes;person.pauseMinutes+=row.pauseMinutes;if(open)person.openShifts++;}shift=null;};
    for(const event of events){const t=Date.parse(event.effective_at);if(t>=limit)break;if(shift&&event.correction_reason)shift.corrected=true;add(t);if(event.action==='start'){finish(t,true);shift={start:t,workMinutes:0,pauseMinutes:0,corrected:false};state='working';}else if(event.action==='pause')state='paused';else if(event.action==='resume')state='working';else if(event.action==='end'){finish(t,false);state='off';}if(shift&&event.correction_reason)shift.corrected=true;at=t;}
    if(shift){add(limit);finish(null,true);}
  }
  return {month,timeZone:window.timeZone,generatedAt:new Date(now).toISOString(),totals,shifts:rows,retentionMinimumMonths:24};
}
