import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import pg from 'pg';
import {migrateOrderNumbers,orderNumber} from '../order-number.js';
if(!process.env.ORDER_NUMBER_TEST_DATABASE_URL)throw Error('Dedicated test database required');
const schema='number_test_'+crypto.randomBytes(8).toString('hex');
const admin=new pg.Pool({connectionString:process.env.ORDER_NUMBER_TEST_DATABASE_URL});
await admin.query('CREATE SCHEMA '+schema);
const pool=new pg.Pool({connectionString:process.env.ORDER_NUMBER_TEST_DATABASE_URL,options:'-c search_path='+schema,max:12});
try {
 await pool.query('CREATE TABLE restaurants(id uuid PRIMARY KEY);CREATE TABLE orders(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),restaurant_id uuid NOT NULL REFERENCES restaurants(id),status text DEFAULT \'served\',created_at timestamptz DEFAULT now())');
 await migrateOrderNumbers(pool);
 const rid=crypto.randomUUID();await pool.query('INSERT INTO restaurants VALUES($1)',[rid]);
 const insert=()=>pool.query('INSERT INTO orders(restaurant_id) VALUES($1) RETURNING id,pickup_number',[rid]);
 const rows=await Promise.all(Array.from({length:60},insert));
 assert.equal(new Set(rows.map(r=>orderNumber(r.rows[0]))).size,60);
 assert.deepEqual(rows.map(r=>Number(r.rows[0].pickup_number)).sort((a,b)=>a-b),Array.from({length:60},(_,i)=>i+1));
 await migrateOrderNumbers(pool);assert.equal(orderNumber((await insert()).rows[0]),'061');
 console.log('PostgreSQL: 60 simultaneous inserts unique, ordered counter and restart continuity passed.');
}finally{await pool.end();await admin.query('DROP SCHEMA '+schema+' CASCADE');await admin.end()}
