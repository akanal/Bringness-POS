import crypto from 'node:crypto';
import {downloadFixture} from './download-fixture.mjs';
export async function seedDownloadHistory(f,{company=f.a,count=23,product='pos-download'}={}){
 const original=(await f.db.query('SELECT * FROM shop_checkout_orders WHERE id=$1',[f.order.id])).rows[0],draft=(await f.db.query('SELECT * FROM shop_order_drafts WHERE id=$1',[original.draft_id])).rows[0],ids=[];
 for(let i=1;i<=count;i++){
  const id=crypto.randomUUID(),draftId=crypto.randomUUID(),guardId=crypto.randomUUID(),time='2026-10-24T12:00:00.'+String(i).padStart(6,'0')+'Z',status=['prepared','uncertain','open','paid','failed','canceled'][(i-1)%6],snapshot={...original.snapshot,...(product==='pos-online'?{productId:product,planCode:'pos_base_monthly',period:'monthly'}:{})};
  await f.db.query("INSERT INTO shop_order_drafts(id,company_id,request_id,cart_hash,snapshot,status,created_at,expires_at) VALUES($1,$2,$3,$4,$5,'canceled',$6::timestamptz,$6::timestamptz+interval '1 hour')",[draftId,company,crypto.randomUUID(),'0'.repeat(64),JSON.stringify(draft.snapshot),time]);
  await f.db.query("INSERT INTO billing_checkout_guards(id,company_id,plan_id,slot,status) VALUES($1,$2,$3,'base','resolved')",[guardId,company,product==='pos-online'?f.online:f.download]);
  await f.db.query('INSERT INTO shop_checkout_orders(id,company_id,draft_id,request_id,guard_id,status,snapshot,provider_mode,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[id,company,draftId,crypto.randomUUID(),guardId,status,JSON.stringify(snapshot),i%2?'test':null,time]);ids.push(id);
 }
 return ids;
}
export async function historyFixture(){const f=await downloadFixture({accept:false,paid:false});await seedDownloadHistory(f);return f;}
