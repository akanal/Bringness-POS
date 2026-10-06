import {markTransactionSigned,receiptTseSnapshot} from './tse-core.js';
export async function signPreparedTse(pool,id,adapter){
 const deviceStatus=await adapter.status();
 if(deviceStatus.certified!==true||!deviceStatus.serialNumber)return {signed:false,reason:'device_not_ready'};
 const tx=(await pool.query(`UPDATE tse_transactions SET state='starting',updated_at=now()
 WHERE id=$1 AND state='prepared' RETURNING *`,[id])).rows[0];if(!tx)return {signed:false,reason:'already_claimed'};
 if(tx.process_data.totalsMatch!==true){await pool.query("UPDATE tse_transactions SET state='failed',error_code='TOTAL_MISMATCH' WHERE id=$1",[id]);return {signed:false,reason:'total_mismatch'};}
 const device=(await pool.query('SELECT serial_number,certified,status FROM tse_devices WHERE restaurant_id=$1',[tx.restaurant_id])).rows[0];
 if(!device?.certified||device.serial_number!==deviceStatus.serialNumber||device.status!=='connected'){
 await pool.query("UPDATE tse_transactions SET state='prepared' WHERE id=$1 AND state='starting'",[id]);return {signed:false,reason:'restaurant_device_mismatch'};}
 let start;
 try{
 start=await adapter.startTransaction(tx.process_data);
 if(!start.transactionNumber||start.certified!==true||start.serialNumber!==device.serial_number)throw Error('INVALID_TSE_START');
 await pool.query("UPDATE tse_transactions SET state='finishing',tse_transaction_number=$2,started_at=$3 WHERE id=$1",[id,String(start.transactionNumber),start.startedAt]);
 const finish=await adapter.finishTransaction({...tx.process_data,transactionNumber:String(start.transactionNumber)});
 if(finish.certified!==true||finish.serialNumber!==device.serial_number||String(finish.transactionNumber)!==String(start.transactionNumber)||!finish.signature||!finish.signatureCounter||!finish.signatureAlgorithm||!finish.finishedAt)throw Error('INVALID_TSE_SIGNATURE');
 const client=await pool.connect();try{await client.query('BEGIN');const signed=await markTransactionSigned(client,id,finish);await client.query("UPDATE receipts SET fiscal_status='signed',tse_snapshot=$2::jsonb WHERE id=$1",[tx.receipt_id,JSON.stringify(receiptTseSnapshot(signed))]);await client.query('COMMIT');}catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
 return {signed:true};
 }catch{
 // The hardware may have applied the action before the connection failed.
 // Never automatically restart or finish that transaction a second time.
 await pool.query("UPDATE tse_transactions SET state='needs_review',error_code='SIGNING_OUTCOME_UNCONFIRMED',updated_at=now() WHERE id=$1 AND state<>'signed'",[id]);return {signed:false,reason:'outcome_unconfirmed'};
 }
}
export async function processPreparedTse(pool,adapterForRestaurant){
 const rows=(await pool.query("SELECT id,restaurant_id FROM tse_transactions WHERE state='prepared' ORDER BY created_at,id LIMIT 10")).rows;
 for(const row of rows)await signPreparedTse(pool,row.id,await adapterForRestaurant(row.restaurant_id));
}
