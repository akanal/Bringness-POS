// Explicit administrator acceptance only; never imported by application startup.
import crypto from 'node:crypto';
import {configuredIdriveDocumentStore} from './idrive-document-store.js';
if(process.argv[2]!=='check'){console.error('Explicit check operation required.');process.exitCode=1;}
else{
 let store;
 try{
  store=await configuredIdriveDocumentStore();if(!store)throw Error();
  const bytes=Buffer.from('%PDF-1.7\nBringness synthetic document storage check only.\n%%EOF\n'),sha=crypto.createHash('sha256').update(bytes).digest('hex');
  const record={company:'00000000-0000-4000-8000-000000000000',id:crypto.randomUUID(),sha,size:bytes.length,mime:'application/pdf',requestDigest:crypto.createHash('sha256').update('synthetic:'+sha).digest('hex')};
  await store.putExact(record,bytes);const readback=await store.getExact(record);if(!readback.equals(bytes))throw Error();
  console.log('PASS: Anwendung kann direkt in IDrive schreiben und dieselben verschluesselten Dateidaten geprueft lesen. Nur synthetische Testdatei; keine Kontodaten oder bestehenden Dateien geaendert.');
 }catch{console.error('Direkter Anwendungsspeicher nicht bestaetigt. Keine geheimen Fehlerdetails ausgegeben.');process.exitCode=1;}finally{store?.close();}
}
