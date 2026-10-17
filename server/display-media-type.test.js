import test from 'node:test';
import assert from 'node:assert/strict';
import {matchesDisplayMedia} from './display-media-type.js';
test('declared display media must have a matching binary signature',()=>{
 const webp=Buffer.concat([Buffer.from('RIFF'),Buffer.alloc(4),Buffer.from('WEBPabcd')]);webp.writeUInt32LE(webp.length-8,4);
 const mp4=Buffer.alloc(20);mp4.writeUInt32BE(20);mp4.write('ftyp',4);mp4.write('isom',8);
 const samples={'image/png':Buffer.from('89504e470d0a1a0a','hex'),'image/jpeg':Buffer.from('ffd8ffdb','hex'),'image/webp':webp,'video/mp4':mp4,'video/webm':Buffer.concat([Buffer.from('1a45dfa3','hex'),Buffer.from('webm')])};
 for(const [mime,bytes] of Object.entries(samples)){assert.equal(matchesDisplayMedia(mime,bytes),true,mime);assert.equal(matchesDisplayMedia(mime,Buffer.from('<html>not media</html>')),false,mime);for(const [other,data] of Object.entries(samples))if(other!==mime)assert.equal(matchesDisplayMedia(mime,data),false);}
 const truncated=Buffer.from(mp4);truncated.writeUInt32BE(1000);assert.equal(matchesDisplayMedia('video/mp4',truncated),false);
 assert.equal(matchesDisplayMedia('image/svg+xml',Buffer.from('<svg/>')),false);assert.equal(matchesDisplayMedia('image/png',null),false);
});
