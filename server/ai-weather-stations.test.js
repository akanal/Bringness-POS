import {test} from 'node:test';
import assert from 'node:assert/strict';
import {stationCoordinate,parseStationCatalog,searchWeatherStations,stationForPostcode} from './ai-weather-stations.js';
test('DWD degrees/minutes conversion, signs and invalid ranges',()=>{
 assert.equal(stationCoordinate('53.30',90),53.5);
 assert.equal(stationCoordinate('-8.40',180),-(8+40/60));
 for(const value of ['91.00','52.60','NaN','52.5'])assert.equal(stationCoordinate(value,90),null);
});
test('catalog rejects invalid rows and deduplicates station IDs',()=>{
 const row='10384 ---- BERLIN-TEMPELHOF 52.28 13.24 48';
 assert.equal(parseStationCatalog(row+'\n '+row+'\ninvalid').length,1);
 assert.equal(parseStationCatalog('10384 ---- BERLIN 99.00 13.24 48').length,0);
});
test('real nationwide catalog covers distant German regions and station IDs',()=>{
 for(const city of ['Berlin','Hamburg','Muenchen','Koeln','Dresden','Stuttgart','Kiel','Saarbruecken'])assert.ok(searchWeatherStations(city).total>0,city);
 assert.ok(searchWeatherStations('Weesby').stations.some(s=>s.id==='A051'));
 const station=searchWeatherStations('10384').stations.find(s=>s.id==='10384');assert.ok(station);assert.match(station.name,/BERLIN/);
 assert.ok(station.latitude>52&&station.latitude<53);
 assert.deepEqual(searchWeatherStations('Berlin'),searchWeatherStations('Berlin'));
});
test('search is bounded, literal and handles German spelling',()=>{
 assert.ok(searchWeatherStations('München').total>0);
 assert.equal(searchWeatherStations('<script>').total,0);
 assert.ok(searchWeatherStations('10').stations.length<=25);
 for(const query of ['', 'x', 'x'.repeat(81)])assert.throws(()=>searchWeatherStations(query));
});

test('postcode assignment preserves leading zeros and finds nationwide nearby stations',()=>{
 for(const code of ['10115','01067','20095','80331','50667','66111']){const result=stationForPostcode(code);assert.equal(result.postcode,code);assert.ok(result.station.distanceKm<=100);assert.equal(result.approximate,true);assert.ok(result.station.id);}
 for(const code of ['00000','999','1011A',10115])assert.throws(()=>stationForPostcode(code));
});
