import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
import {createCanvas} from '@napi-rs/canvas';

// Run only against the disposable database/account supplied by integration.mjs.
// Optional private photo is read locally and is never copied to the repository.
export async function verifyDeliveryDocumentFlow({call,query,root,accountId,locationId,token,foreignToken}){
 let bytes,mime='image/png';
 if(process.env.REAL_DELIVERY_PHOTO){bytes=fs.readFileSync(process.env.REAL_DELIVERY_PHOTO);mime=bytes[0]===255?'image/jpeg':'image/png';}
 else{const c=createCanvas(1400,800),x=c.getContext('2d');x.fillStyle='white';x.fillRect(0,0,1400,800);x.fillStyle='black';x.font='42px sans-serif';['Lieferant: Testlieferant','Lieferschein Nr. FOTO-123','Lieferdatum: 21.10.2026','Testware 3 Stk'].forEach((s,i)=>x.fillText(s,70,100+i*120));bytes=c.toBuffer('image/png');}
 const initialNotes=Number((await query('SELECT count(*) n FROM ai_delivery_notes WHERE account_id=$1',[accountId])).rows[0].n);
 const dom=new JSDOM('<section id="content"></section>',{runScripts:'outside-only',url:'https://isolated.example.test'}),w=dom.window;
 let notices=[],lastUpload,loseAcknowledgement=true,confirmationBodies=[],successfulReplies=[];
 const api=async(path,body)=>{
  const result=await call(path,body,token);
  if(result.status>=400)throw Error(result.error||'Test request rejected');
  if(path==='delivery-notes/upload')lastUpload=result;
  if(path==='delivery-notes/confirm'){
   confirmationBodies.push(structuredClone(body));successfulReplies.push(result);
   if(loseAcknowledgement){loseAcknowledgement=false;throw Error('Simulated lost acknowledgement after committed receipt');}
  }
  return result;
 };
 const render=()=>w.BringnessDeliveryNotes.render({api,account:{id:accountId},notice:message=>notices.push(message)});
 w.confirm=()=>true;
 w.eval(fs.readFileSync(root+'/apps/web/public/ai-delivery-notes.js','utf8'));
 try{
  await render();const upload=w.document.getElementById('delivery-upload');
  Object.defineProperty(upload.elements.document,'files',{value:[new w.File([bytes],'local-test-photo'+(mime==='image/jpeg'?'.jpg':'.png'),{type:mime})]});
  await upload.onsubmit({preventDefault(){},currentTarget:upload});
  assert(lastUpload?.note?.id,'actual UI upload must create a draft');
  const noteId=lastUpload.note.id;assert.equal(lastUpload.note.status,'draft');
  assert.equal(Number((await query('SELECT count(*) n FROM ai_delivery_notes WHERE account_id=$1',[accountId])).rows[0].n),initialNotes+1);
  const first=await call('delivery-notes/'+noteId,null,token);assert.equal(first.status,200);
  const candidate=first.note.extraction.lines.find(line=>!line.header&&line.quantity>0&&line.unitKnown);
  assert(candidate,'photo must yield a quantified merchandise row');assert.equal(candidate.reviewed,false);
  const stockId=crypto.randomUUID();
  await query('INSERT INTO ai_stock(id,account_id,location_id,name,unit,quantity,minimum) VALUES($1,$2,$3,$4,$5,0,0)',[stockId,accountId,locationId,candidate.description,candidate.unit]);
  const stock=async()=>Number((await query('SELECT quantity FROM ai_stock WHERE id=$1',[stockId])).rows[0].quantity);
  assert.equal(await stock(),0);
  const duplicate=await call('delivery-notes/upload',{locationId,filename:'same-photo',data:bytes.toString('base64')},token);assert.equal(duplicate.duplicate,true);assert.equal(duplicate.note.id,noteId);
  assert.equal(Number((await query('SELECT count(*) n FROM ai_delivery_notes WHERE account_id=$1',[accountId])).rows[0].n),initialNotes+1);
  assert.equal((await call('delivery-notes/'+noteId,null,foreignToken)).status,404);
  await render();await w.document.querySelector('[data-note="'+noteId+'"]').onclick();
  const form=w.document.getElementById('delivery-confirm');assert(form);assert.equal(form.elements.confirmed.checked,false);
  const selected=w.document.querySelector('#delivery-lines tr[data-source-index="'+candidate.sourceIndex+'"]');assert(selected);assert.equal(selected.querySelector('[data-field="stockId"]').value,stockId);
  if(first.note.extraction.originalText)assert.match(w.document.querySelector('#delivery-review pre').textContent,/Vorheriger OCR-Versuch/);
  for(const row of [...w.document.querySelectorAll('#delivery-lines tr')])if(row!==selected)row.querySelector('[data-remove]').click();
  const accepted=candidate.quantity>1?candidate.quantity-1:candidate.quantity;
  selected.querySelector('[data-field="quantity"]').value=String(accepted);
  selected.querySelector('[data-field="netEuros"]').value='';
  form.elements.supplier.value='Isolierter Testlieferant';form.elements.reference.value='LOCAL-'+crypto.randomUUID();form.elements.deliveryDate.value='2026-10-21';
  await form.onsubmit({preventDefault(){},currentTarget:form});assert.equal(await stock(),0);assert.equal(confirmationBodies.length,0);
  form.elements.confirmed.checked=true;
  await form.onsubmit({preventDefault(){},currentTarget:form});assert.equal(await stock(),accepted);assert.equal(confirmationBodies.length,1);assert.match(notices.at(-1),/lost acknowledgement/);
  await form.onsubmit({preventDefault(){},currentTarget:form});assert.equal(await stock(),accepted);assert.equal(confirmationBodies.length,2);assert.deepEqual(confirmationBodies[1],confirmationBodies[0]);assert.equal(successfulReplies[1].duplicate,true);
  assert.equal(Number((await query('SELECT count(*) n FROM ai_stock_moves WHERE stock_id=$1',[stockId])).rows[0].n),1);
  assert.equal((await query('SELECT * FROM ai_confirmed_purchase_prices WHERE stock_id=$1',[stockId])).rows.length,0);
  const saved=await call('delivery-notes/'+noteId,null,token);assert.equal(saved.note.status,'confirmed');assert.equal(Number(saved.note.lines[0].quantity),accepted);
  const after=await call('delivery-notes/upload',{locationId,filename:'again',data:bytes.toString('base64')},token);assert.equal(after.duplicate,true);assert.equal(after.note.id,noteId);assert.equal(await stock(),accepted);
  assert.equal((await call('delivery-notes/confirm',confirmationBodies[0],foreignToken)).status,404);
  console.log('Photo-to-stock acceptance passed: '+(process.env.REAL_DELIVERY_PHOTO?'private supplied photo':'synthetic CI photo')+', actual upload UI/FileReader and OCR, authenticated restaurant draft, no pre-confirm stock, corrected accepted quantity, missing price stays unknown, foreign-account denial, lost acknowledgement retry, exactly one stock movement and duplicate upload after confirmation. Disposable local account only.');
 }finally{w.close();}
}
