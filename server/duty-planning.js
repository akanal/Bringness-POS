import crypto from 'node:crypto';
import {enqueueMail} from './transactional-mail.js';
const digest=s=>crypto.createHash('sha256').update(s).digest('hex');
const fail=(error,status=400)=>{throw Object.assign(Error(error),{status})};
const uuid=s=>/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(String(s||''));
const send=(res,status,data)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(data));return true};
export async function migrateDutyPlanning(pool){await pool.query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS roster_available boolean NOT NULL DEFAULT false;
CREATE TABLE IF NOT EXISTS staff_absences(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,kind text NOT NULL CHECK(kind IN ('sick','vacation')),state text NOT NULL CHECK(state IN ('pending','approved','declined','cancelled','ended')),starts_at timestamptz NOT NULL,ends_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),CHECK(ends_at IS NULL OR ends_at>starts_at));
ALTER TABLE waiter_schedules ADD COLUMN IF NOT EXISTS original_employee_id uuid REFERENCES employees(id) ON DELETE SET NULL;
ALTER TABLE waiter_schedules ADD COLUMN IF NOT EXISTS coverage_state text NOT NULL DEFAULT 'planned';
CREATE TABLE IF NOT EXISTS roster_events(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,employee_id uuid REFERENCES employees(id) ON DELETE SET NULL,kind text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),acknowledged_at timestamptz);
CREATE INDEX IF NOT EXISTS staff_absences_employee_idx ON staff_absences(employee_id,starts_at);`)}
const overlap=(a,b)=>Date.parse(a.starts_at)<(b.ends_at?Date.parse(b.ends_at):Infinity)&&Date.parse(b.starts_at)<Date.parse(a.ends_at);
export function availableForShift(employee,shift,schedules,absences,{restHours=11,dailyHours=8,weeklyHours=40}={}){
 if(!employee.active||absences.some(a=>a.employee_id===employee.id&&a.state==='approved'&&overlap(shift,a)))return false;
 const start=Date.parse(shift.starts_at),end=Date.parse(shift.ends_at),hours=(end-start)/3600000;if(hours>dailyHours)return false;
 const other=schedules.filter(s=>s.id!==shift.id&&s.employee_id===employee.id&&s.coverage_state!=='open');
 if(other.some(s=>{const a=Date.parse(s.starts_at),b=Date.parse(s.ends_at);return a<end+restHours*3600000&&b>start-restHours*3600000}))return false;
 const week=other.filter(s=>Math.abs(Date.parse(s.starts_at)-start)<7*86400000).reduce((n,s)=>n+(Date.parse(s.ends_at)-Date.parse(s.starts_at))/3600000,0);
 return week+hours<=weeklyHours;
}
export async function replanDuty(c,rid){
 const people=(await c.query('SELECT id,role,active,roster_available FROM employees WHERE restaurant_id=$1',[rid])).rows;
 const shifts=(await c.query("SELECT * FROM waiter_schedules WHERE restaurant_id=$1 AND ends_at>now()-interval '7 days' ORDER BY starts_at,id FOR UPDATE",[rid])).rows;
 const absences=(await c.query("SELECT * FROM staff_absences WHERE restaurant_id=$1 AND state='approved'",[rid])).rows;
 let open=0,replaced=0,restored=0;
 for(const shift of shifts){if(Date.parse(shift.ends_at)<=Date.now())continue;const original=shift.original_employee_id||shift.employee_id,person=people.find(p=>p.id===original),blocked=absences.some(a=>a.employee_id===original&&overlap(shift,a));
 if(blocked){const candidates=people.filter(p=>p.id!==original&&p.role===person?.role&&p.roster_available&&availableForShift(p,shift,shifts,absences));
 candidates.sort((a,b)=>(a.id===shift.employee_id?-1:b.id===shift.employee_id?1:0)||shifts.filter(s=>s.employee_id===a.id&&s.coverage_state!=='open').length-shifts.filter(s=>s.employee_id===b.id&&s.coverage_state!=='open').length||a.id.localeCompare(b.id));
 const chosen=candidates[0];shift.original_employee_id=original;shift.employee_id=chosen?.id||original;shift.coverage_state=chosen?'replaced':'open';if(chosen)replaced++;else open++;
 await c.query('UPDATE waiter_schedules SET original_employee_id=$2,employee_id=$3,coverage_state=$4 WHERE id=$1',[shift.id,original,shift.employee_id,shift.coverage_state]);
 }else if(shift.original_employee_id&&person&&availableForShift(person,shift,shifts,absences)){
 shift.employee_id=original;shift.original_employee_id=null;shift.coverage_state='planned';restored++;await c.query("UPDATE waiter_schedules SET employee_id=$2,original_employee_id=NULL,coverage_state='planned' WHERE id=$1",[shift.id,original]);
 }}return {open,replaced,restored};
}
export function createDutyPlanning(pool){return async(req,res)=>{
 const url=new URL(req.url,'http://local'),p=url.pathname,own=p==='/api/v1/waiter/duty',roster=p==='/api/v1/roster',schedules=p==='/api/v1/owner/schedules';if(!own&&!roster&&!schedules)return false;let c;
 try{
 const token=String(req.headers.authorization||'').replace(/^Bearer\s+/i,'');const u=token?(await pool.query("SELECT u.id,u.company_id,u.role,s.token_hash FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now() AND u.status='active' AND NOT coalesce(u.must_change_password,false)",[digest(token)])).rows[0]:null;if(!u)fail('Nicht angemeldet',401);
 let b={};if(req.method==='POST'){let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>10000)fail('Anfrage zu groß',413)}try{b=JSON.parse(raw||'{}')}catch{fail('Ungültige Anfrage')}}else b=Object.fromEntries(url.searchParams);
 let employee,rid=b.restaurantId;
 if(own){if(u.role!=='waiter')fail('Kein Kellnerzugang',403);employee=(await pool.query('SELECT id,restaurant_id,display_name FROM employees WHERE user_id=$1 AND active=true',[u.id])).rows[0];if(!employee)fail('Mitarbeiter nicht gefunden',404);rid=employee.restaurant_id;}
 else if(!['owner','admin'].includes(u.role))fail('Keine Verwaltungsberechtigung',403);
 if(!uuid(rid)||!(await pool.query('SELECT id FROM restaurants WHERE id=$1 AND company_id=$2',[rid,u.company_id])).rowCount)fail('Betrieb nicht gefunden',404);
 if(req.method==='GET'){
 if(schedules)return send(res,200,{schedules:(await pool.query(`SELECT s.*,e.display_name,oe.display_name original_name FROM waiter_schedules s JOIN employees e ON e.id=s.employee_id LEFT JOIN employees oe ON oe.id=s.original_employee_id WHERE s.restaurant_id=$1 AND s.ends_at>now()-interval '7 days' AND e.active=true ORDER BY s.starts_at LIMIT 300`,[rid])).rows});
 const absences=(await pool.query(`SELECT a.*,e.display_name FROM staff_absences a JOIN employees e ON e.id=a.employee_id WHERE a.restaurant_id=$1 AND ($2::uuid IS NULL OR a.employee_id=$2) AND (a.ends_at IS NULL OR a.ends_at>now()-interval '30 days') ORDER BY a.created_at DESC LIMIT 150`,[rid,employee?.id||null])).rows;
 const shifts=(await pool.query("SELECT s.*,r.name restaurant_name,e.display_name FROM waiter_schedules s JOIN employees e ON e.id=s.employee_id JOIN restaurants r ON r.id=s.restaurant_id WHERE s.restaurant_id=$1 AND s.ends_at>now() AND ($2::uuid IS NULL OR s.employee_id=$2 AND s.coverage_state<>'open') ORDER BY s.starts_at LIMIT 300",[rid,employee?.id||null])).rows;
 return send(res,200,{absences,shifts,...(!own?{people:(await pool.query('SELECT id,display_name,roster_available FROM employees WHERE restaurant_id=$1 AND active=true',[rid])).rows,events:(await pool.query('SELECT v.id,v.kind,v.created_at,e.display_name FROM roster_events v LEFT JOIN employees e ON e.id=v.employee_id WHERE v.restaurant_id=$1 AND v.acknowledged_at IS NULL ORDER BY v.created_at DESC LIMIT 100',[rid])).rows}:{})});
 }
 if(req.method!=='POST')fail('Methode nicht erlaubt',405);
 if(!own){const unlock=String(req.headers['x-personnel-unlock']||'');if(!(await pool.query('SELECT 1 FROM personnel_unlocks WHERE token_hash=$1 AND session_hash=$2 AND user_id=$3 AND expires_at>now()',[digest(unlock),u.token_hash,u.id])).rowCount)fail('Verwaltungs-PIN erforderlich',403)}
 c=await pool.connect();await c.query('BEGIN');await c.query('SELECT id FROM restaurants WHERE id=$1 FOR UPDATE',[rid]);let kind=b.action||'schedule',eventEmployee=employee?.id,createdSchedule=null;
 if(schedules){if(!uuid(b.employeeId)||!Number.isFinite(Date.parse(b.startsAt))||!Number.isFinite(Date.parse(b.endsAt))||Date.parse(b.endsAt)<=Date.parse(b.startsAt)||Date.parse(b.endsAt)-Date.parse(b.startsAt)>24*3600000)fail('Dienstzeit ungültig');const e=(await c.query('SELECT id FROM employees WHERE id=$1 AND restaurant_id=$2 AND active=true',[b.employeeId,rid])).rows[0];if(!e)fail('Mitarbeiter nicht erlaubt',403);createdSchedule=(await c.query('INSERT INTO waiter_schedules(employee_id,restaurant_id,starts_at,ends_at,note,recurrence) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',[e.id,rid,b.startsAt,b.endsAt,String(b.note||'').slice(0,300),String(b.recurrence||'').slice(0,50)])).rows[0];}
 else if(own&&kind==='sick'){
 if(!(await c.query("SELECT 1 FROM staff_absences WHERE employee_id=$1 AND kind='sick' AND state='approved' AND ends_at IS NULL",[employee.id])).rowCount)await c.query("INSERT INTO staff_absences(employee_id,restaurant_id,kind,state,starts_at) VALUES($1,$2,'sick','approved',now())",[employee.id,rid]);else{await c.query('COMMIT');return send(res,200,{message:'Krankmeldung ist bereits gespeichert.'})}
 }else if(own&&kind==='return'){
 const changed=await c.query("UPDATE staff_absences SET ends_at=greatest(now(),starts_at+interval '1 second'),state='ended' WHERE employee_id=$1 AND kind='sick' AND state='approved' AND ends_at IS NULL RETURNING id",[employee.id]);if(!changed.rowCount)fail('Keine offene Krankmeldung vorhanden');
 }else if(own&&kind==='vacation'){
 if(!Number.isFinite(Date.parse(b.startsAt))||!Number.isFinite(Date.parse(b.endsAt))||Date.parse(b.endsAt)<=Date.now()||Date.parse(b.endsAt)<=Date.parse(b.startsAt)||Date.parse(b.endsAt)-Date.parse(b.startsAt)>90*86400000)fail('Urlaubszeitraum ungültig');
 if((await c.query("SELECT 1 FROM staff_absences WHERE employee_id=$1 AND state IN ('approved','pending') AND starts_at<$3 AND coalesce(ends_at,'infinity')>$2",[employee.id,b.startsAt,b.endsAt])).rowCount)fail('Dieser Zeitraum überschneidet sich mit einer vorhandenen Abwesenheit');await c.query("INSERT INTO staff_absences(employee_id,restaurant_id,kind,state,starts_at,ends_at) VALUES($1,$2,'vacation','pending',$3,$4)",[employee.id,rid,b.startsAt,b.endsAt]);
 }else if(!own&&['approve','decline'].includes(kind)){
 if(!uuid(b.absenceId))fail('Ungültige Anfrage');const changed=await c.query("UPDATE staff_absences SET state=$3 WHERE id=$1 AND restaurant_id=$2 AND kind='vacation' AND state='pending' RETURNING employee_id",[b.absenceId,rid,kind==='approve'?'approved':'declined']);if(!changed.rowCount)fail('Urlaubsantrag nicht gefunden',404);eventEmployee=changed.rows[0].employee_id;
 }else if(!own&&kind==='availability'){
 if(!uuid(b.employeeId)||typeof b.available!=='boolean')fail('Ungültige Verfügbarkeit');const changed=await c.query('UPDATE employees SET roster_available=$3 WHERE id=$1 AND restaurant_id=$2 AND active=true RETURNING id',[b.employeeId,rid,b.available]);if(!changed.rowCount)fail('Mitarbeiter nicht gefunden',404);
 }else if(!own&&kind==='acknowledge'){await c.query('UPDATE roster_events SET acknowledged_at=now() WHERE restaurant_id=$1',[rid]);}
 else fail('Aktion nicht erlaubt',403);
 const planning=await replanDuty(c,rid);
 if(own||['approve','decline'].includes(kind)){
 const event=(await c.query('INSERT INTO roster_events(restaurant_id,employee_id,kind) VALUES($1,$2,$3) RETURNING id',[rid,eventEmployee,kind])).rows[0];
 if(own){const owners=(await c.query("SELECT email FROM users WHERE company_id=$1 AND role IN ('owner','admin') AND status='active'",[u.company_id])).rows;for(const owner of owners)await enqueueMail(c,'roster:'+event.id+':'+digest(owner.email),owner.email,{subject:'Bringness – '+({sick:'Krankmeldung',return:'Rückmeldung zum Dienst',vacation:'Urlaubsantrag'}[kind]),text:employee.display_name+' hat eine '+({sick:'Krankmeldung',return:'Rückmeldung zum Dienst',vacation:'Urlaubsanfrage'}[kind])+' gemeldet. Dienstplan: '+planning.replaced+' Vertretungen, '+planning.open+' offene Dienste. Bitte in Bringness unter Dienstplan prüfen.'});}
 }
 await c.query('COMMIT');return send(res,200,{...(createdSchedule||{}),message:'Gespeichert. Der Inhaber wurde informiert; der Dienstplan ist aktualisiert.',planning});
 }catch(error){if(c)await c.query('ROLLBACK').catch(()=>{});return send(res,error.status||500,{error:error.status?error.message:'Dienstplanung momentan nicht verfügbar'})}finally{c?.release()}
 }}
