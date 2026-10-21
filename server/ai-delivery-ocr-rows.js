import {parseDeliveryLine} from './ai-delivery-core.js';

// Reassemble sparse OCR fragments by their observed page position, never by guessed values.
export function sparseRows(blocks){
 const fragments=(blocks||[]).flatMap(b=>(b.paragraphs||[]).flatMap(p=>p.lines||[])).filter(l=>l.text?.trim()&&l.bbox&&['x0','x1','y0','y1'].every(k=>Number.isFinite(l.bbox[k]))&&l.bbox.x1>l.bbox.x0&&l.bbox.y1>l.bbox.y0).slice(0,4000).sort((a,b)=>(a.bbox.y0+a.bbox.y1)-(b.bbox.y0+b.bbox.y1)||a.bbox.x0-b.bbox.x0);
 const rows=[];
 for(const fragment of fragments){
  const box=fragment.bbox,center=(box.y0+box.y1)/2,height=box.y1-box.y0;
  const row=rows.filter(r=>Math.abs(r.center-center)<=.65*Math.min(r.height,height)&&r.parts.every(p=>box.x1<=p.bbox.x0||box.x0>=p.bbox.x1)).sort((a,b)=>Math.abs(a.center-center)-Math.abs(b.center-center))[0];
  if(row)row.parts.push(fragment);else rows.push({center,height,parts:[fragment]});
 }
 return rows.map(row=>row.parts.sort((a,b)=>a.bbox.x0-b.bbox.x0).map(p=>p.text.trim().replace(/\s+/g,' ')).join(' ')).join('\n');
}
const quantities=text=>text.split(/\r?\n/).map(parseDeliveryLine).filter(l=>l.quantity!=null).map(l=>l.quantity+':'+l.unit);
export function selectOcrPass(primary,secondary){
 const candidate=sparseRows(secondary.blocks);
 // A higher average confidence alone must never replace a known quantity/unit with a missing or changed one.
 const available=quantities(candidate);const preserves=quantities(primary.text).every(key=>{const i=available.indexOf(key);if(i<0)return false;available.splice(i,1);return true;});
 const fits=candidate.length<=80000&&candidate.split('\n').length<=100;
 return candidate&&fits&&preserves&&secondary.confidence>=primary.confidence+5?{text:candidate,confidence:secondary.confidence,originalText:primary.text,method:'sparse-rows'}:{text:primary.text,confidence:primary.confidence,method:'auto'};
}
