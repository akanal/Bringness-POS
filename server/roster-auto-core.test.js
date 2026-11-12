import test from 'node:test';import assert from 'node:assert/strict';import {normalizeRosterPolicy,zonedInstant,weeklyInterval,makeRosterProposal,assignmentProblem,rosterContextHash,nextMonday} from './roster-auto-core.js';
const a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222',need='33333333-3333-4333-8333-333333333333';
const policy=()=>({enabled:true,timezone:'Europe/Berlin',needs:[{id:need,weekday:1,start:'09:00',end:'17:00',role:'waiter',count:1,skills:[]}],profiles:[a,b].map(employeeId=>({employeeId,enabled:true,skills:[],windows:[{weekday:1,start:'00:00',end:'00:00'},{weekday:2,start:'00:00',end:'00:00'}]}))});
const context=()=>({version:1,policy:normalizeRosterPolicy(policy()),people:[a,b].map(id=>({id,role:'waiter',active:true})),existing:[],absences:[],patterns:[],exceptions:[]});
const now=Date.parse('2027-01-01T00:00Z'),week='2027-01-04';
test('roster dates respect local zone and reject missing and ambiguous DST wall times',()=>{
 assert.equal(zonedInstant('2027-01-04','09:00','Europe/Berlin'),'2027-01-04T08:00:00.000Z');assert.equal(zonedInstant('2027-07-05','09:00','Europe/Berlin'),'2027-07-05T07:00:00.000Z');
 assert.throws(()=>zonedInstant('2027-03-28','02:30','Europe/Berlin'),/Zeitumstellung/);assert.throws(()=>zonedInstant('2027-10-31','02:30','Europe/Berlin'),/Zeitumstellung/);
 assert.equal(nextMonday('2027-01-04T12:00Z','Europe/Berlin'),'2027-01-11');assert.equal(weeklyInterval('2027-01-04','22:00','06:00','Europe/Berlin').ends_at,'2027-01-05T05:00:00.000Z');
});
test('policy is explicit, bounded and rejects duplicate or overlapping weekly coverage',()=>{
 assert.equal(normalizeRosterPolicy({...policy(),enabled:false,needs:[],profiles:[]}).enabled,false);
 assert.throws(()=>normalizeRosterPolicy({...policy(),needs:[policy().needs[0],{...policy().needs[0],id:a}]}),/zusammenfassen/);
 assert.throws(()=>normalizeRosterPolicy({...policy(),needs:[{...policy().needs[0],start:'09:00',end:'18:00'}]}),/acht Stunden/);
 assert.equal(context().policy.profiles[0].windows[0].end,'00:00');
});
test('automatic proposals require opted-in availability, role, qualifications and absence clearance',()=>{
 const c=context();let proposal=makeRosterProposal(c,week,{now});assert.equal(proposal.slots[0].employeeId,a);assert.equal(proposal.openCount,0);
 c.absences=[{id:'absence',employee_id:a,state:'approved',starts_at:'2027-01-04T00:00Z',ends_at:'2027-01-05T00:00Z'}];assert.equal(makeRosterProposal(c,week,{now}).slots[0].employeeId,b);
 c.policy.profiles[1].enabled=false;assert.equal(makeRosterProposal(c,week,{now}).openCount,1);
 c.absences=[];c.policy.needs[0].skills=['barista'];assert.equal(makeRosterProposal(c,week,{now}).openCount,1);c.policy.profiles[0].skills=['barista'];assert.equal(makeRosterProposal(c,week,{now}).slots[0].employeeId,a);
 c.people[0].role='cook';assert.equal(makeRosterProposal(c,week,{now}).openCount,1);
});
test('approved shifts cover requirements and protected draft choices remain selected',()=>{
 const c=context(),first=makeRosterProposal(c,week,{now}).slots[0];c.existing=[{id:'published',employee_id:a,starts_at:first.startsAt,ends_at:first.endsAt,coverage_state:'planned',manual_lock:true,planner_revision:1}];
 assert.equal(makeRosterProposal(c,week,{now}).slots.length,0);c.existing=[];
 const manual={...first,employeeId:b,manual:true};assert.equal(makeRosterProposal(c,week,{now,manualSlots:[manual]}).slots[0].employeeId,b);
 const hash=rosterContextHash(c);c.people[1].active=false;assert.notEqual(rosterContextHash(c),hash);assert.equal(makeRosterProposal(c,week,{now,manualSlots:[manual]}).slots[0].employeeId,b);assert.match(makeRosterProposal(c,week,{now,manualSlots:[manual]}).slots[0].reason,/aktiv/);
});
test('proposed shifts are included in conflicts and daily/weekly planning limits',()=>{
 const c=context(),slot={key:'new',employeeId:a,startsAt:'2027-01-04T08:00Z',endsAt:'2027-01-04T12:00Z',role:'waiter',skills:[]};
 assert.equal(assignmentProblem(c.people[0],slot,c),null);
 assert.match(assignmentProblem(c.people[0],slot,{...c,slots:[{...slot,key:'prior'}]}),/Zeitüberschneidung/);
 c.policy.profiles[0].windows=[];c.existing=[{id:'old',employee_id:a,starts_at:'2027-01-04T00:00Z',ends_at:'2027-01-04T06:00Z',coverage_state:'planned'}];assert.match(assignmentProblem(c.people[0],slot,c,{manual:true}),/Abstand/);
 c.existing=[{id:'old',employee_id:a,starts_at:'2027-01-04T00:00Z',ends_at:'2027-01-04T06:00Z',coverage_state:'planned'}];slot.startsAt='2027-01-04T17:00Z';slot.endsAt='2027-01-04T21:00Z';assert.match(assignmentProblem(c.people[0],slot,c,{manual:true}),/acht geplante/);
});
test('permanent manual patterns yield proposals, exceptions stop one occurrence and no duplicate published shift is created',()=>{
 const c=context();c.patterns=[{id:'pattern',employee_id:b,weekday:1,start_time:'09:00',end_time:'17:00',role:'waiter',skills:[],from_date:'2027-01-01'}];
 const p=makeRosterProposal(c,week,{now});assert.equal(p.slots.length,1);assert.equal(p.slots[0].employeeId,b);assert.equal(p.slots[0].manual,true);
 c.exceptions=[{pattern_id:'pattern',occurrence:week}];assert.equal(makeRosterProposal(c,week,{now}).slots[0].employeeId,a);
 c.existing=[{id:'done',employee_id:b,starts_at:p.slots[0].startsAt,ends_at:p.slots[0].endsAt,coverage_state:'planned'}];c.exceptions=[];assert.equal(makeRosterProposal(c,week,{now}).slots.length,0);
});

test('one multi-qualified published employee cannot cover two simultaneous staffing requirements',()=>{const c=context();c.policy.needs=[{...c.policy.needs[0],skills:['barista']},{...c.policy.needs[0],id:b,skills:['bar']}];c.policy.profiles[0].skills=['bar','barista'];c.policy.profiles[1].skills=['barista'];c.existing=[{id:'published',employee_id:a,starts_at:'2027-01-04T08:00Z',ends_at:'2027-01-04T16:00Z',coverage_state:'planned'}];const p=makeRosterProposal(c,week,{now});assert.equal(p.slots.length,1);assert.equal(p.slots[0].employeeId,b);});
