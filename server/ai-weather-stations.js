import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {distanceKm} from './ai-planning-core.js';

// DWD CFG coordinates are degrees.minutes, not decimal degrees.
export function stationCoordinate(raw,limit){
 if(!/^-?\d{1,3}\.\d{2}$/.test(raw))return null;
 const [degrees,minutes]=raw.replace('-','').split('.').map(Number);
 const value=(degrees+minutes/60)*(raw.startsWith('-')?-1:1);
 return minutes<60&&Math.abs(value)<=limit?value:null;
}
export function parseStationCatalog(source){
 const stations=new Map();
 for(const line of source.split(/\r?\n/)){
  const match=line.trim().match(/^([A-Z0-9]{3,6})\s+([A-Z0-9-]{4})\s+(.+?)\s+(-?\d{1,3}\.\d{2})\s+(-?\d{1,3}\.\d{2})\s+(-?\d+)\s*$/);
  if(!match)continue;
  const [,id,icao,name,lat,lon]=match,latitude=stationCoordinate(lat,90),longitude=stationCoordinate(lon,180);
  if(latitude===null||longitude===null||stations.has(id))continue;
  stations.set(id,{id,name:name.trim(),icao:icao==='----'?'':icao,latitude,longitude});
 }
 return [...stations.values()].sort((a,b)=>a.name.localeCompare(b.name,'de'));
}
const normalize=value=>value.toUpperCase().replace(/Ä/g,'AE').replace(/Ö/g,'OE').replace(/Ü/g,'UE').replace(/ß/g,'SS').normalize('NFD').replace(/[\u0300-\u036f]/g,'');
let catalog;
function stationCatalog(){return catalog??=parseStationCatalog(gunzipSync(readFileSync(new URL('./data/dwd-mosmix-stations.cfg.gz',import.meta.url))).toString('utf8'));}
let postcodeCenters;
export function stationForPostcode(postcode){
 if(typeof postcode!=='string'||!/^\d{5}$/.test(postcode))throw Object.assign(Error('Gültige deutsche Postleitzahl erforderlich.'),{status:400});
 postcodeCenters??=JSON.parse(gunzipSync(readFileSync(new URL('./data/de-postcode-centers.json.gz',import.meta.url))).toString('utf8'));
 const point=postcodeCenters[postcode];
 if(!point)throw Object.assign(Error('Postleitzahl nicht im Ortsverzeichnis gefunden. Bitte Station manuell auswählen.'),{status:400});
 const origin={latitude:point[0],longitude:point[1]};
 const nearest=stationCatalog().map(station=>({...station,distanceKm:distanceKm(origin,station)})).sort((a,b)=>a.distanceKm-b.distanceKm||a.id.localeCompare(b.id))[0];
 if(!nearest||nearest.distanceKm>100)throw Object.assign(Error('Keine nahe DWD-Station gefunden. Bitte manuell auswählen.'),{status:400});
 return {postcode,station:{...nearest,distanceKm:Math.round(nearest.distanceKm*10)/10},approximate:true,source:'GeoNames / Deutscher Wetterdienst',retrievedAt:'2026-10-21'};
}
export function searchWeatherStations(query){
 if(typeof query!=='string'||query.trim().length<2||query.length>80)throw Object.assign(Error('Mindestens zwei und höchstens 80 Suchzeichen erforderlich.'),{status:400});
 const terms=normalize(query.trim()).split(/\s+/),found=stationCatalog().filter(s=>terms.every(t=>normalize(s.name+' '+s.id+' '+s.icao).includes(t)));
 return {stations:found.slice(0,25),total:found.length,source:'Deutscher Wetterdienst, MOSMIX-Stationskatalog',retrievedAt:'2026-10-21'};
}
