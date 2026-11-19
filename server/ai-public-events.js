import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {isolatedPreview} from './preview-policy.js';
import {berlinClock} from './ai-forecast-core.js';
import {distanceKm,validDay} from './ai-planning-core.js';

const origin='https://api-v2.kulturdaten.berlin/api/';
export const publicEventSource={name:'kulturdaten.berlin',url:'https://www.kulturdaten.berlin/',documentation:'https://kulturdaten.readme.io/reference/introduction'};
let postcodeCenters;
function postcodePoint(postcode){if(typeof postcode!=='string'||!/^\d{5}$/.test(postcode))return null;postcodeCenters??=JSON.parse(gunzipSync(readFileSync(new URL('./data/de-postcode-centers.json.gz',import.meta.url))).toString('utf8'));return postcodeCenters[postcode]||null;}
const label=x=>typeof x?.de==='string'?x.de:typeof x?.en==='string'?x.en:'';
const clean=(x,max)=>typeof x==='string'?x.replace(/<[^>]*>/g,'').replace(/[\u0000-\u001f]/g,' ').trim().slice(0,max):'';
const nextDay=day=>new Date(Date.parse(day+'T12:00:00Z')+86400000).toISOString().slice(0,10);
// Reject nonexistent AND ambiguous wall times rather than silently moving an event.
export function berlinInstant(day,time){
 if(!validDay(day)||typeof time!=='string'||!/^\d{2}:\d{2}(:\d{2})?$/.test(time))return null;
 const [h,m,s=0]=time.split(':').map(Number);if(h>23||m>59||s>59)return null;
 const local=Date.parse(day+'T00:00:00Z')+(h*3600+m*60+s)*1000,found=[];
 const fmt=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
 for(const offset of [1,2]){const d=new Date(local-offset*3600000);if(fmt.format(d)===day+' '+String(h).padStart(2,'0')+':'+String(m).padStart(2,'0')+':'+String(s).padStart(2,'0'))found.push(d.toISOString());}
 return found.length===1?found[0]:null;
}
export function normalizePublicEvent(event,locations,now=new Date()){
 if(event?.status!=='event.published'||!/^E_[A-Z0-9]{1,80}$/.test(event.identifier||'')||!['event.scheduled','event.rescheduled','event.cancelled','event.postponed'].includes(event.scheduleStatus))return [];
 const s=event.schedule;if(!s||s.permanentOpening||!validDay(s.startDate)||!validDay(s.endDate||s.startDate))return [];
 const title=clean(label(event.title)||event.attractions?.map(a=>label(a.referenceLabel)).filter(Boolean).join(' / '),150);if(!title)return [];
 const allDay=!s.startTime||s.startTime==='00:00:00'&&(!s.endTime||s.endTime==='00:00:00');
 const start=berlinInstant(s.startDate,allDay?'00:00:00':s.startTime),estimatedEnd=allDay||!s.endTime||s.endTime==='00:00:00';
 const end=berlinInstant(estimatedEnd?nextDay(s.endDate||s.startDate):s.endDate||s.startDate,estimatedEnd?'00:00:00':s.endTime);
 if(!start||!end||Date.parse(end)<=Date.parse(start)||Date.parse(end)-Date.parse(start)>31*86400000)return [];
 const updated=event.metadata?.updated;if(!Number.isFinite(Date.parse(updated))||Date.parse(updated)>now.getTime()+3600000)return [];
 const refs=Array.isArray(event.locations)?event.locations:[];
 return [...new Set(refs.map(r=>r.referenceId))].flatMap(locationId=>{
  const l=locations.get(locationId);if(!l||l.status!=='location.published'||l.isVirtual===true)return [];
  const approximate=!l.coordinates;const point=approximate?postcodePoint(l.address?.postalCode):null;
  const lat=approximate?point?.[0]:l.coordinates?.latitude,lon=approximate?point?.[1]:l.coordinates?.longitude;
  if(![lat,lon].every(v=>(typeof v==='number'||typeof v==='string'&&v.trim()!=='')&&Number.isFinite(Number(v))))return [];
  const latitude=Number(lat),longitude=Number(lon);if(Math.abs(latitude)>90||Math.abs(longitude)>180)return [];
  const place=clean(label(l.title),300);if(!place)return [];
  return [{id:'public:'+event.identifier+':'+locationId,title,place,starts_at:start,ends_at:end,latitude,longitude,status:['event.cancelled','event.postponed'].includes(event.scheduleStatus)?'cancelled':'active',version:updated,updated_at:updated,public:true,own:false,shared:true,allDay,endEstimated:estimatedEnd,locationApproximate:approximate,postcode:approximate?l.address.postalCode:undefined,source:publicEventSource.name,sourceUrl:origin+'events/'+event.identifier}];
 });
}

export function createPublicEventService({fetcher=(...a)=>globalThis.fetch(...a),clock=()=>new Date()}={}){
 let cached=null,pending=null;
 const unavailable=()=>({available:false,events:[],source:publicEventSource,message:'Öffentliche Berliner Termine vorübergehend nicht verfügbar; eigene Termine bleiben erhalten.'});
 async function load(){
  const started=clock(),today=berlinClock(started).date;
  if(cached&&cached.day===today&&started-cached.at>=0&&started-cached.at<(cached.result.available?3600000:300000))return structuredClone(cached.result);
  if(pending)return pending.then(structuredClone);
  const task=Promise.resolve().then(async()=>{
   const signal=AbortSignal.timeout(45000);let bytes=0;
   const get=async path=>{
    const response=await fetcher(origin+path,{signal,redirect:'error',headers:{Accept:'application/json'}});if(!response.ok||!response.headers.get('content-type')?.includes('application/json'))throw Error('Public events unavailable');
    const reader=response.body.getReader(),chunks=[];let size=0;
    try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;bytes+=value.byteLength;if(size>2000000||bytes>16000000){await reader.cancel();throw Error('Public event limit');}chunks.push(Buffer.from(value));}}finally{reader.releaseLock();}
    const r=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(r.success!==true||!r.data)throw Error('Public event response');return r.data;
   };
   const pages=async(kind,query,maxPages)=>{
    const first=await get(kind+'?pageSize=500&page=1'+query),total=first.totalCount;
    if(!Number.isSafeInteger(total)||total<0||total>maxPages*500)throw Error('Public event page limit');
    const count=Math.max(1,Math.ceil(total/500)),responses=[first];
    for(let page=2;page<=count;page+=4)responses.push(...await Promise.all(Array.from({length:Math.min(4,count-page+1)},(_,i)=>get(kind+'?pageSize=500&page='+(page+i)+query))));
    const all=[],seen=new Map();let duplicateCount=0;
    for(const [i,data] of responses.entries()){
     const rows=data[kind];
     if(!Array.isArray(rows)||rows.length>500||data.page!==i+1||data.pageSize!==500||data.totalCount!==total)throw Error('Incomplete public event catalogue');
     for(const row of rows){if(!row||typeof row.identifier!=='string')throw Error('Invalid public event identifier');if(seen.has(row.identifier)){duplicateCount++;const old=seen.get(row.identifier);if(Date.parse(row.metadata?.updated)>Date.parse(old.metadata?.updated))seen.set(row.identifier,row);}else seen.set(row.identifier,row);all.push(row);}
    }
    if(all.length!==total)throw Error('Incomplete public event page');
    return {rows:[...seen.values()],duplicateCount};
   };
   try{
    // Global date-window requests contain no account, restaurant or coordinates.
    const until=new Date(Date.parse(today+'T12:00:00Z')+30*86400000).toISOString().slice(0,10);
    const locationPage=await pages('locations','',12),eventPage=await pages('events','&inFuture=false&startDate='+today+'&endDate='+until,24);
    const locations=locationPage.rows,events=eventPage.rows;
    const map=new Map(locations.map(l=>[l.identifier,l])),completed=clock();
    const normalized=events.flatMap(e=>normalizePublicEvent(e,map,completed)).filter(e=>berlinClock(new Date(e.ends_at)).date>=today&&berlinClock(new Date(e.starts_at)).date<=until);
    const result={available:true,events:normalized,source:publicEventSource,fetchedAt:completed.toISOString(),partial:locationPage.duplicateCount>0||eventPage.duplicateCount>0,duplicateCount:eventPage.duplicateCount,coverage:'Berliner Kulturdaten, nächste 30 Tage; keine vollständige Liste aller Veranstaltungen.',totalEvents:events.length};
    cached={day:today,at:completed,result};return result;
   }catch{const result=unavailable();cached={day:today,at:clock(),result};return result;}
  }).finally(()=>{pending=null;});
  pending=task;return task.then(structuredClone);
 }
 return async settings=>{
  if(typeof settings?.latitude!=='number'||typeof settings?.longitude!=='number'||!Number.isFinite(settings.radiusKm)||settings.radiusKm<1||settings.radiusKm>100)return {available:false,events:[],source:publicEventSource,message:'Für öffentliche Termine Standortkoordinaten hinterlegen.'};
  if(distanceKm(settings,{latitude:52.52,longitude:13.405})>150)return {available:false,events:[],source:publicEventSource,message:'Die öffentliche Terminquelle deckt derzeit Berlin ab.'};
  const result=await load();result.events=result.events.filter(e=>distanceKm(settings,e)<=settings.radiusKm).map(e=>({...e,distanceKm:Math.round(distanceKm(settings,e)*10)/10}));return result;
 };
}
const service=createPublicEventService();
export const publicEvents=settings=>isolatedPreview()?Promise.resolve({available:false,events:[],source:publicEventSource,message:'Öffentliche Terminabfrage in der isolierten Vorschau ausgeschaltet.'}):service(settings);
