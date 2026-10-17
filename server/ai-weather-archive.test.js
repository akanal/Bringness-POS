import test from 'node:test';
import assert from 'node:assert/strict';
import {unzipKml,archiveCrc32} from './ai-weather.js';
const samples=["UEsDBBQAAAAAAOw+UV2f+6wgEgAAABIAAAAMAAAAZm9yZWNhc3Qua21sPGttbD5maXh0dXJlPC9rbWw+UEsBAhQDFAAAAAAA7D5RXZ/7rCASAAAAEgAAAAwAAAAAAAAAAAAAAIABAAAAAGZvcmVjYXN0LmttbFBLBQYAAAAAAQABADoAAAA8AAAAAAA=", "UEsDBBQAAAAIAOw+UV2f+6wgEQAAABIAAAAMAAAAZm9yZWNhc3Qua21ss8nOzbFLy6woKS1KtdEHcQBQSwECFAMUAAAACADsPlFdn/usIBEAAAASAAAADAAAAAAAAAAAAAAAgAEAAAAAZm9yZWNhc3Qua21sUEsFBgAAAAABAAEAOgAAADsAAAAAAA=="];
test('weather archives accept independent standard ZIP fixtures and reject damaged checksums',()=>{
 assert.equal(archiveCrc32(Buffer.from('123456789')),0xcbf43926);
 for(const raw of samples){
  const archive=Buffer.from(raw,'base64');assert.equal(unzipKml(archive),'<kml>fixture</kml>');
  const damaged=Buffer.from(archive),directory=damaged.indexOf(Buffer.from('504b0102','hex'));damaged[directory+16]^=1;assert.throws(()=>unzipKml(damaged),/checksum/);
  const encrypted=Buffer.from(archive);encrypted[directory+8]|=1;assert.throws(()=>unzipKml(encrypted),/Encrypted/);
 }
});
