import assert from 'node:assert/strict';
import {randomUUID as uuid} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {migrateConsumptionHistory} from '../ai-consumption.js';

const db=new PGlite();
try{
 await db.exec(`CREATE TABLE ai_stock(id uuid PRIMARY KEY,account_id uuid);
  CREATE TABLE ai_sale_events(id uuid PRIMARY KEY,account_id uuid,event_type text,occurred_at timestamptz,created_at timestamptz DEFAULT now());
  CREATE TABLE ai_sale_effects(event_id uuid,stock_id uuid,delta numeric);
  CREATE TABLE ai_stock_moves(id bigserial PRIMARY KEY,stock_id uuid,kind text,delta numeric,created_at timestamptz DEFAULT now());`);
 const buyer=uuid(),other=uuid(),stock=uuid(),otherStock=uuid();
 await db.query('INSERT INTO ai_stock VALUES($1,$2),($3,$4)',[stock,buyer,otherStock,other]);
 await migrateConsumptionHistory(db);await migrateConsumptionHistory(db);
 const sale=async(days,delta,{legacy=false,stockId=stock,account=buyer}={})=>{
  const event=uuid();
  await db.query(`INSERT INTO ai_sale_events(id,account_id,event_type,occurred_at,created_at)
   VALUES($1,$2,'sale',CASE WHEN $3 THEN NULL ELSE now()-$4::int*interval '1 day' END,
   CASE WHEN $3 THEN now()-$4::int*interval '1 day' ELSE now() END)`,[event,account,legacy,days]);
  await db.query('INSERT INTO ai_sale_effects VALUES($1,$2,$3)',[event,stockId,delta]);
 };
 await sale(40,-280); // A delayed import is not a new consumption spike today.
 await sale(5,-140);await sale(15,-28,{legacy:true});await sale(-1,-999);
 await sale(2,-700,{stockId:otherStock,account:other});
 for(const [kind,delta] of [['recipe_consumption',-14],['recipe_return',4],['legacy',-99],['count',-500],['received',500]]){
  await db.query('INSERT INTO ai_stock_moves(stock_id,kind,delta) VALUES($1,$2,$3)',[stock,kind,delta]);
 }
 const total=await db.query(`SELECT sum(-delta)::text consumption FROM ai_consumption_events
  WHERE account_id=$1 AND occurred_at>=now()-interval '28 days' AND occurred_at<=now()`,[buyer]);
 assert.equal(Number(total.rows[0].consumption),178);
 const sources=(await db.query('SELECT source_kind,count(*)::int records FROM ai_consumption_events WHERE account_id=$1 GROUP BY source_kind',[buyer])).rows;
 assert.equal(sources.find(s=>s.source_kind==='sales').records,4);
 assert.equal(sources.find(s=>s.source_kind==='kitchen').records,2);
 assert.equal(Number((await db.query('SELECT sum(-delta) total FROM ai_consumption_events WHERE account_id=$1',[other])).rows[0].total),700);
 const delayed=(await db.query("SELECT occurred_at<recorded_at-interval '28 days' historical FROM ai_consumption_events WHERE delta=-280")).rows[0];
 assert.equal(delayed.historical,true);
 console.log('Consumption history passed: delayed source time, legacy fallback, kitchen use/returns, no duplicate legacy moves, future exclusion and tenant isolation.');
}finally{await db.close();}
