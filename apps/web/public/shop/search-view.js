export function searchSegments(text,query){
 const source=String(text),lower=source.toLocaleLowerCase('de-DE'),ranges=[];
 const words=[...new Set(String(query).slice(0,150).normalize('NFC').trim().toLocaleLowerCase('de-DE').split(/\s+/).filter(Boolean))];
 for(const word of words){let at=0;while((at=lower.indexOf(word,at))!==-1){ranges.push([at,at+word.length]);at+=word.length;}}
 ranges.sort((a,b)=>a[0]-b[0]);const merged=[];for(const range of ranges){const last=merged.at(-1);if(last&&range[0]<=last[1])last[1]=Math.max(last[1],range[1]);else merged.push([...range]);}
 const result=[];let at=0;for(const [start,end]of merged){if(start>at)result.push({text:source.slice(at,start),match:false});result.push({text:source.slice(start,end),match:true});at=end;}if(at<source.length)result.push({text:source.slice(at),match:false});return result;
}
export function markSearch(element,text,query){element.replaceChildren();for(const part of searchSegments(text,query)){const n=document.createElement(part.match?'mark':'span');n.textContent=part.text;element.append(n);}}
