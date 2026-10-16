import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import {ensureTseSchema,markTransactionSigned} from '../server/tse-core.js';

test('PostgreSQL enforces guarded TSE state transitions',{skip:!process.env.TSE_TEST_DATABASE_URL},async()=>{
 const connectionString=process.env.TSE_TEST_DATABASE_URL;
 assert.ok(connectionString,'TSE_TEST_DATABASE_URL is required');
 const pool=new pg.Pool({connectionString});
 const suffix='tse_it_'+Date.now().toString(36);
 const client=await pool.connect();
 try{
  await client.query('BEGIN');
  await client.query('CREATE SCHEMA '+suffix);
  await client.query('SET LOCAL search_path TO '+suffix+',public');
  await client.query('CREATE TABLE restaurants(id uuid PRIMARY KEY)');
  await client.query('CREATE TABLE orders(id uuid PRIMARY KEY)');
  await client.query('CREATE TABLE receipts(id uuid PRIMARY KEY, fiscal_status text)');
  await ensureTseSchema(client);
  const restaurant='11111111-1111-4111-8111-111111111111';
  const receipt='22222222-2222-4222-8222-222222222222';
  await client.query('INSERT INTO restaurants(id) VALUES($1)',[restaurant]);
  await client.query('INSERT INTO receipts(id) VALUES($1)',[receipt]);
  const tx=(await client.query("INSERT INTO tse_transactions(restaurant_id,receipt_id,client_transaction_id,process_data,state) VALUES($1,$2,'test-tx','{}','needs_review') RETURNING id",[restaurant,receipt])).rows[0];
  const result={transactionNumber:'42',serialNumber:'serial',signatureCounter:'1',signatureAlgorithm:'ecdsa',signature:'signature'};
  assert.equal(await markTransactionSigned(client,tx.id,result),null);
  assert.equal((await client.query('SELECT state FROM tse_transactions WHERE id=$1',[tx.id])).rows[0].state,'needs_review');
  await client.query("UPDATE tse_transactions SET state='finishing' WHERE id=$1",[tx.id]);
  const signed=await markTransactionSigned(client,tx.id,result);
  assert.equal(signed.state,'signed');
  assert.equal(signed.signature,'signature');
  const receiptSnapshot={
   transactionNumber:signed.tse_transaction_number,
   serialNumber:signed.tse_serial_number,
   signatureCounter:signed.signature_counter,
   signature:signed.signature
  };
  const updated=await client.query(
   "UPDATE receipts SET fiscal_status='signed',tse_snapshot=$2::jsonb,tse_transaction_id=$3 WHERE id=$1 RETURNING *",
   [receipt,JSON.stringify(receiptSnapshot),tx.id]
  );
  assert.equal(updated.rowCount,1);
  const linked=(await client.query(
   'SELECT r.fiscal_status,r.tse_snapshot,r.tse_transaction_id,t.state,t.signature FROM receipts r JOIN tse_transactions t ON t.id=r.tse_transaction_id WHERE r.id=$1',
   [receipt]
  )).rows[0];
  assert.equal(linked.fiscal_status,'signed');
  assert.equal(linked.state,'signed');
  assert.equal(linked.tse_transaction_id,tx.id);
  assert.equal(linked.tse_snapshot.signature,linked.signature);
  const otherTx=(await client.query(
   "INSERT INTO tse_transactions(restaurant_id,receipt_id,client_transaction_id,process_data,state) VALUES($1,$2,'other-tx','{}','signed') RETURNING id",
   [restaurant,receipt]
  )).rows[0];
  const reassignment=await client.query(
   "UPDATE receipts SET tse_transaction_id=$2 WHERE id=$1 AND (tse_transaction_id IS NULL OR tse_transaction_id=$2)",
   [receipt,otherTx.id]
  );
  assert.equal(reassignment.rowCount,0);
  assert.equal((await client.query('SELECT tse_transaction_id FROM receipts WHERE id=$1',[receipt])).rows[0].tse_transaction_id,tx.id);
  assert.equal(await markTransactionSigned(client,tx.id,result),null);
  await assert.rejects(
   client.query("INSERT INTO tse_transactions(restaurant_id,receipt_id,client_transaction_id,process_data,state) VALUES($1,$2,'test-tx','{}','prepared')",[restaurant,receipt]),
   error=>error.code==='23505'
  );
 }finally{
  try{await client.query('ROLLBACK')}finally{client.release();await pool.end()}
 }
});
