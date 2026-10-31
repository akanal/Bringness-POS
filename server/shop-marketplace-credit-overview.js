import {sessionHash,shopActor} from './shop-account.js';
import {marketplaceCreditPolicy} from './shop-marketplace-credit.js';
// Reads never open accounts or perform financial/provider writes.
export async function readMarketplaceCreditOverview(pool,{token}){
 const db=await pool.connect();
 try{
  await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  await db.query("SET LOCAL statement_timeout='5s'");
  const actor=await shopActor(db,sessionHash(token));
  const account=(await db.query('SELECT balance_cents,terminated_at FROM shop_market_credit_accounts WHERE company_id=$1',[actor.company_id])).rows[0];
  const rows=(await db.query('SELECT kind,amount_cents,created_at FROM shop_market_credit_entries WHERE company_id=$1 ORDER BY created_at DESC,kind,reference LIMIT 51',[actor.company_id])).rows;
  const result={currency:'EUR',policy:marketplaceCreditPolicy,accountExists:!!account,balanceNetCents:account?Number(account.balance_cents):0,payoutEligible:!!account?.terminated_at,limit:50,hasMore:rows.length>50,entries:rows.slice(0,50).map(r=>({kind:r.kind,amountNetCents:Number(r.amount_cents),createdAt:new Date(r.created_at).toISOString()})),automaticSettlementEnabled:false,canPay:false};
  await db.query('COMMIT');return result;
 }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
}
