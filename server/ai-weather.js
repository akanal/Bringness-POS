import {inflateRawSync} from 'node:zlib';
import {berlinClock} from './ai-forecast-core.js';
// MOSMIX KMZ contains a single KML. Read its central directory; enforce bounds before inflation.
export function unzipKml(b){if(!Buffer.isBuffer(b)||b.length>2000000)throw Error('Invalid KMZ');let end=-1;for(let i=b.length-22;i>=Math.max(0,b.length-65557);i--)if(b.readUInt32LE(i)===0x06054b50){end=i;break}if(end<0)throw Error('Invalid ZIP');let offset=b.readUInt32LE(end+16);for(let n=0;n<b.readUInt16LE(end+10);n++){if(offset+46>b.length||b.readUInt32LE(offset)!==0x02014b50)throw Error('Invalid directory');const method=b.readUInt16LE(offset+10),size=b.readUInt32LE(offset+20),rawSize=b.readUInt32LE(offset+24),length=b.readUInt16LE(offset+28),extra=b.readUInt16LE(offset+30),comment=b.readUInt16LE(offset+32),local=b.readUInt32LE(offset+42),name=b.subarray(offset+46,offset+46+length).toString();if(offset+46+length+extra+comment>b.length)throw Error('Invalid directory length');if(name.endsWith('.kml')){if(method!==0&&method!==8)throw Error('Invalid compression');if(rawSize>4000000||local+30>b.length||b.readUInt32LE(local)!==0x04034b50)throw Error('Invalid KML');const start=local+30+b.readUInt16LE(local+26)+b.readUInt16LE(local+28);if(start+size>b.length||start+size>offset||b.readUInt16LE(local+8)!==method)throw Error('Truncated or overlapping KML');const bytes=b.subarray(start,start+size);const out=method===8?inflateRawSync(bytes,{maxOutputLength:4000000}):method===0?bytes:null;if(!out||out.length!==rawSize)throw Error('Invalid compression');return out.toString('latin1')}offset+=46+length+extra+comment}throw Error('KML missing')}
const decode=s=>s.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'");
export function parseMosmix(xml,now=new Date()){
 const times=[...xml.matchAll(/<dwd:TimeStep>([^<]+)<\/dwd:TimeStep>/g)].map(x=>x[1]);const issue=xml.match(/<dwd:IssueTime>([^<]+)<\/dwd:IssueTime>/)?.[1];
 if(!(now instanceof Date)||!Number.isFinite(now.getTime())||!times.length||times.length>1000||!issue||!Number.isFinite(Date.parse(issue))||Date.parse(issue)>now.getTime()+3600000||now.getTime()-Date.parse(issue)>36*3600000)throw Error('Forecast stale');
 const values=key=>{const m=xml.match(new RegExp('<dwd:Forecast dwd:elementName="'+key+'">\\s*<dwd:value>([^<]+)'));return m?m[1].trim().split(/\s+/).map(v=>v==='-'?null:Number(v)):[]};
 const t=values('TTT'),rain=values('RR1c');if(t.length!==times.length||rain.length!==times.length)throw Error('Forecast measurement count mismatch');const today=berlinClock(now).date;const days=new Map();
 times.forEach((time,i)=>{
  const timestamp=Date.parse(time);if(!Number.isFinite(timestamp))throw Error('Invalid forecast timestamp');
  const day=berlinClock(new Date(timestamp)).date;
  if(day<today||Date.parse(day+'T12:00:00Z')-Date.parse(today+'T12:00:00Z')>6*86400000)return;
  let d=days.get(day);
  if(!d){d={date:day,temperatures:[],rainValues:[],times:new Set(),invalid:false};days.set(day,d)}
  // Duplicates and non-hourly points must never fill a missing hour.
  if(d.times.has(timestamp)||timestamp%3600000!==0){d.invalid=true;return}
  d.times.add(timestamp);
  if(Number.isFinite(t[i])&&t[i]!==null&&t[i]>180&&t[i]<340)d.temperatures.push(t[i]-273.15);
  if(Number.isFinite(rain[i])&&rain[i]!==null&&rain[i]>=0)d.rainValues.push(rain[i]);
 });
 // Berlin has 23, 24 or 25 real hours per calendar day. Count UTC instants,
 // including both occurrences of 02:00 during the autumn clock change.
 const expectedHours=day=>{
  const midnight=Date.parse(day+'T00:00:00Z');let count=0;
  for(let offset=-3;offset<=27;offset++)if(berlinClock(new Date(midnight+offset*3600000)).date===day)count++;
  return count;
 };
 const coords=xml.match(/<kml:coordinates>([^<]+)<\/kml:coordinates>/)?.[1].split(',').map(Number)||[];
 return {available:true,issuedAt:issue,station:decode(xml.match(/<kml:description>([^<]+)<\/kml:description>/)?.[1]||''),latitude:Number.isFinite(coords[1])&&coords[1]>=-90&&coords[1]<=90?coords[1]:null,longitude:Number.isFinite(coords[0])&&coords[0]>=-180&&coords[0]<=180?coords[0]:null,days:[...days.values()].map(d=>({date:d.date,minC:d.temperatures.length?Math.round(Math.min(...d.temperatures)*10)/10:null,maxC:d.temperatures.length?Math.round(Math.max(...d.temperatures)*10)/10:null,rainMm:d.rainValues.length?Math.round(d.rainValues.reduce((a,b)=>a+b,0)*10)/10:null,partial:d.invalid||d.times.size!==expectedHours(d.date)||d.temperatures.length!==d.times.size||d.rainValues.length!==d.times.size,hours:d.times.size})),source:'Quelle: Deutscher Wetterdienst, MOSMIX (bearbeitete Darstellung)',sourceUrl:'https://opendata.dwd.de/weather/local_forecasts/mos/MOSMIX_L/'};
}
const cache=new Map(),pending=new Map();
export async function weatherForecast(station){if(!station)return {available:false,message:'DWD-Station unter Planung & Termine festlegen.'};if(!/^[A-Z0-9]{3,6}$/.test(station))return {available:false,message:'Ungültige DWD-Station.'};const old=cache.get(station);if(old&&Date.now()-old.fetched<(old.result.available?3600000:300000))return old.result;if(pending.has(station))return pending.get(station);const task=(async()=>{try{const url=`https://opendata.dwd.de/weather/local_forecasts/mos/MOSMIX_L/single_stations/${station}/kml/MOSMIX_L_LATEST_${station}.kmz`;const response=await fetch(url,{signal:AbortSignal.timeout(10000),redirect:'error'});if(!response.ok)throw Error('DWD unavailable');const reader=response.body.getReader(),chunks=[];let total=0;while(true){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>2000000){await reader.cancel();throw Error('DWD too large')}chunks.push(Buffer.from(value))}const result=parseMosmix(unzipKml(Buffer.concat(chunks)));result.stationId=station;result.fetchedAt=new Date().toISOString();cache.set(station,{fetched:Date.now(),result});if(cache.size>100)cache.delete(cache.keys().next().value);return result}catch{const result={available:false,message:'DWD-Wetterdaten vorübergehend nicht verfügbar. Verkaufsprognose bleibt nutzbar.'};cache.set(station,{fetched:Date.now(),result});if(cache.size>100)cache.delete(cache.keys().next().value);return result}finally{pending.delete(station)}})();pending.set(station,task);return task}
