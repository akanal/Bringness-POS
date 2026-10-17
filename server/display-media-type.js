// File-signature checks, not a codec/antivirus or complete media decoder.
export function matchesDisplayMedia(mime,bytes){
 if(!Buffer.isBuffer(bytes))return false;
 if(mime==='image/png')return bytes.length>=8&&bytes.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex'));
 if(mime==='image/jpeg')return bytes.length>=3&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
 if(mime==='image/webp')return bytes.length>=12&&bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP'&&bytes.readUInt32LE(4)+8===bytes.length;
 if(mime==='video/webm')return bytes.length>=8&&bytes.subarray(0,4).equals(Buffer.from('1a45dfa3','hex'))&&bytes.subarray(4,Math.min(bytes.length,4096)).includes(Buffer.from('webm'));
 if(mime==='video/mp4'){
  let at=0;while(at+8<=bytes.length&&at<65536){const size=bytes.readUInt32BE(at),type=bytes.toString('ascii',at+4,at+8);if(size<8||at+size>bytes.length)return false;if(type==='ftyp')return size>=16;if(!['free','skip','wide'].includes(type))return false;at+=size;}
 }
 return false;
}
