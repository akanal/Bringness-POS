export function singleByteRange(header,length){
 if(!Number.isSafeInteger(length)||length<0)throw TypeError('Invalid representation length');
 if(!header)return {status:200,start:0,end:length-1,length};
 if(typeof header!=='string'||header.length>200||!length)return {status:416};
 const match=/^bytes=(\d*)-(\d*)$/.exec(header.trim());if(!match||!match[1]&&!match[2])return {status:416};
 const size=BigInt(length);let start,end=size-1n;
 if(!match[1]){const suffix=BigInt(match[2]);if(!suffix)return {status:416};start=suffix>=size?0n:size-suffix;}
 else{start=BigInt(match[1]);if(match[2]){end=BigInt(match[2]);if(end>=size)end=size-1n;}}
 if(start>=size||start>end)return {status:416};return {status:206,start:Number(start),end:Number(end),length:Number(end-start+1n)};
}
