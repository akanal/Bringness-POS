import {test} from 'node:test';import assert from 'node:assert/strict';import {EventEmitter} from 'node:events';import {recognizeDocument} from './ai-delivery-notes.js';
let terminated=0;class ExitWorker extends EventEmitter{constructor(){super();queueMicrotask(()=>this.emit('exit',0));}async terminate(){terminated++;}}
class GoodWorker extends ExitWorker{constructor(){super();queueMicrotask(()=>this.emit('message',{text:'fixture'}));}}
class MessageWorker extends EventEmitter{constructor(){super();queueMicrotask(()=>this.emit('message',{text:'fixture'}));}async terminate(){terminated++;}}
class InvalidWorker extends MessageWorker{constructor(){super();this.removeAllListeners();queueMicrotask(()=>this.emit('message',null));}}
test('OCR exit without result and invalid messages fail promptly and release single-flight capacity',async()=>{
 await assert.rejects(recognizeDocument(Buffer.alloc(0),'image/png',{WorkerClass:ExitWorker}),e=>e.status===503);
 const result=await recognizeDocument(Buffer.alloc(0),'image/png',{WorkerClass:MessageWorker});assert.equal(result.text,'fixture');assert.equal(terminated,2);
 class Bad extends EventEmitter{constructor(){super();queueMicrotask(()=>this.emit('message',null));}terminate(){return Promise.resolve();}}
 await assert.rejects(recognizeDocument(Buffer.alloc(0),'image/png',{WorkerClass:Bad}),e=>e.status===503);
});
