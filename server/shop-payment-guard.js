import {shopError} from './shop-account.js';
// Called only after the company/order lock. The reservation must belong to the
// exact immutable plan and payment, including when an attachment is replayed.
export async function lockShopPaymentGuard(db,order,{state,paymentId=null}){
 const guard=(await db.query(`SELECT g.*,bp.code AS plan_code FROM billing_checkout_guards g
  JOIN billing_plans bp ON bp.id=g.plan_id
  WHERE g.company_id=$1 AND g.id=$2 FOR UPDATE OF g`,[order.company_id,order.guard_id])).rows[0];
 if(!guard||guard.slot!=='base'||guard.status!==state||guard.plan_code!==order.snapshot?.planCode||(guard.provider_payment_id??null)!==paymentId)throw shopError('CHECKOUT_PENDING');
 return guard;
}
