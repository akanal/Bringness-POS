import {test} from 'node:test';import assert from 'node:assert/strict';import {Writable} from 'node:stream';import {installerUrl,streamInstaller} from './installer-stream.js';
test('installer failures close the download safely instead of leaving an unhandled source error',async()=>{
 const broken=new ReadableStream({start(c){c.error(Error('Fixture storage failure'));}}),out=new Writable({write(c,e,done){done();}});assert.equal(await streamInstaller(broken,out),false);assert(out.destroyed);
 let data='';const good=new Writable({write(c,e,done){data+=c.toString();done();}});assert.equal(await streamInstaller(new Response('fixture').body,good),true);assert.equal(data,'fixture');
 for(const url of ['http://storage.test/setup.exe','https://user:secret@storage.test/setup.exe'])assert.throws(()=>installerUrl(url));assert.equal(installerUrl('https://storage.test/setup.exe'),'https://storage.test/setup.exe');
});
