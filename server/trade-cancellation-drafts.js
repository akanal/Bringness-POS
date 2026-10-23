import crypto from 'node:crypto';
import {readCancellationReview} from './trade-cancellation-review.js';
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const uuid=s=>typeof s==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
const fail=(status,message)=>Object.assign(Error(message),{status});

export function draftRequest(body){
 if(!body||!uuid(body.requestKey)||typeof body.reason!=='string')throw fail(400,'Vorgangskennung und Stornogrund erforderlich.');
 const reason=body.reason.trim();
 if(reason.length<3||reason.length>500||/[\x00-\x1f\x7f]/.test(body.reason))throw fail(400,'Stornogrund mit 3 bis 500 Zeichen eingeben.');
 return {requestKey:body.requestKey.toLowerCase(),reason};
}
export async function migrateCancellationDrafts(db){
 await db.query(`CREATE TABLE IF NOT EXISTS pos_trade_cancellation_drafts(
  id uuid PRIMARY KEY,company_id uuid NOT NULL REFERENCES companies(id),
  receipt_id uuid NOT NULL UNIQUE REFERENCES receipts(id),request_key uuid NOT NULL,
  fingerprint text NOT NULL,reason text NOT NULL CHECK(length(reason) BETWEEN 3 AND 500),
  review jsonb NOT NULL,created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(company_id,request_key));`);
}
const present=row=>({status:'draft_only',canCancel:false,id:row.id,receiptId:row.receipt_id,requestKey:row.request_key,reason:row.reason,createdAt:row.created_at,review:row.review});

export async function getCancellationDraft(pool,user,receiptId){
 const receipt=await pool.query('SELECT rc.id FROM receipts rc JOIN orders o ON o.id=rc.order_id JOIN restaurants r ON r.id=o.restaurant_id JOIN pos_trade_sales t ON t.order_id=o.id WHERE rc.id=$1 AND r.company_id=$2',[receiptId,user.company_id]);
 if(!receipt.rows.length)throw fail(404,'Rechnung nicht gefunden.');
 const row=(await pool.query('SELECT * FROM pos_trade_cancellation_drafts WHERE receipt_id=$1 AND company_id=$2',[receiptId,user.company_id])).rows[0];
 return row?present(row):null;
}

export async function saveCancellationDraft(pool,authenticate,req,user,receiptId,body){
 const b=draftRequest(body),fingerprint=hash(JSON.stringify({receiptId:receiptId.toLowerCase(),reason:b.reason}));
 const c=await pool.connect();
 try{
  await c.query('BEGIN');
  const actor=await authenticate(req,c,true);
  if(!actor||actor.id!==user.id||actor.company_id!==user.company_id||!['owner','admin'].includes(actor.role))throw fail(403,'Inhaber- oder Administratorfreigabe erforderlich.');
  const unlock=String(req.headers['x-personnel-unlock']||''),session=String(req.headers.authorization||'').replace(/^Bearer /,'');
  if(!unlock||!(await c.query('SELECT 1 FROM personnel_unlocks WHERE token_hash=$1 AND session_hash=$2 AND user_id=$3 AND expires_at>now() FOR SHARE',[hash(unlock),hash(session),actor.id])).rows.length)throw fail(403,'Verwaltungs-PIN erforderlich.');
  // Requests first, then receipt. Replays and distinct requests for the same invoice serialize.
  await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['trade-cancellation-request:'+actor.company_id+':'+b.requestKey]);
  await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['trade-cancellation-receipt:'+receiptId.toLowerCase()]);
  const existing=(await c.query('SELECT * FROM pos_trade_cancellation_drafts WHERE company_id=$1 AND (request_key=$2 OR receipt_id=$3)',[actor.company_id,b.requestKey,receiptId])).rows;
  if(existing.length){
   const same=existing.find(r=>r.request_key===b.requestKey&&r.receipt_id===receiptId.toLowerCase()&&r.fingerprint===fingerprint);
   if(!same)throw fail(409,'Für diese Rechnung oder Vorgangskennung existiert bereits ein anderer Entwurf. Gespeicherten Entwurf öffnen.');
   await c.query('COMMIT');return {draft:present(same),replayed:true};
  }
  const review=await readCancellationReview(c,actor,receiptId);
  if(!review)throw fail(404,'Rechnung nicht gefunden.');
  if(review.issues.length)throw fail(409,'Die Storno-Vorprüfung enthält offene Punkte. Zuerst diese Punkte klären.');
  const row=(await c.query('INSERT INTO pos_trade_cancellation_drafts(id,company_id,receipt_id,request_key,fingerprint,reason,review,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',[crypto.randomUUID(),actor.company_id,receiptId,b.requestKey,fingerprint,b.reason,JSON.stringify(review),actor.id])).rows[0];
  await c.query('COMMIT');return {draft:present(row),replayed:false};
 }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
}
