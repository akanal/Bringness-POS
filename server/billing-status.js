import crypto from "node:crypto";
import pg from "pg";

const pool=new pg.Pool({
  connectionString:process.env.DATABASE_URL,
  ssl:process.env.NODE_ENV==="production"?{rejectUnauthorized:false}:false,
});

function send(res,status,payload){
  res.writeHead(status,{"content-type":"application/json","cache-control":"no-store"});
  res.end(JSON.stringify(payload));
}

function bearer(req){return String(req.headers.authorization||"").replace(/^Bearer\s+/i,"")}

async function currentUser(req){
  const token=bearer(req);
  if(!token)return null;
  const tokenHash=crypto.createHash("sha256").update(token).digest("hex");
  const q=await pool.query(`
    SELECT u.id,u.company_id,u.role
    FROM sessions s JOIN users u ON u.id=s.user_id
    WHERE s.token_hash=$1 AND s.expires_at>now() AND u.status='active'
  `,[tokenHash]);
  return q.rows[0]||null;
}

export async function handleBillingStatus(req,res){
  const pathname=new URL(req.url,"http://localhost").pathname;
  if(pathname!=="/api/v1/billing/status")return false;
  if(req.method!=="GET"){send(res,405,{error:"Methode nicht erlaubt"});return true}

  const user=await currentUser(req);
  if(!user){send(res,401,{error:"Nicht angemeldet"});return true}

  const [plans,features,entitlements]=await Promise.all([
    pool.query(`SELECT bp.code,bp.name,bp.billing_type,bp.amount_cents,bp.currency,bp.active,
      t.monthly_net_cents,t.note special_note FROM billing_plans bp
      LEFT JOIN company_billing_terms t ON t.plan_code=bp.code AND t.company_id=$1 ORDER BY bp.code`,[user.company_id]),
    pool.query(`SELECT feature_code,status,starts_at,ends_at,grace_until,payment_status FROM company_features WHERE company_id=$1`,[user.company_id]),
    pool.query(`SELECT bp.code,ce.status,ce.current_period_end,ce.purchased_at FROM company_entitlements ce JOIN billing_plans bp ON bp.id=ce.plan_id WHERE ce.company_id=$1 ORDER BY ce.created_at DESC`,[user.company_id])
  ]);

  const featureMap=new Map(features.rows.map(row=>[row.feature_code,row]));
  const activeFeature=code=>{
    const row=featureMap.get(code);
    if(!row||row.status!=="active")return false;
    const end=row.ends_at?new Date(row.ends_at).getTime():null;
    const grace=row.grace_until?new Date(row.grace_until).getTime():null;
    const now=Date.now();
    return (!end||end>now)||Boolean(grace&&grace>now);
  };

  const state={
    pos_base:activeFeature("pos_base"),
    restaurant:activeFeature("restaurant"),
    table_qr:activeFeature("table_qr"),
  };

  const dependencyState={
    pos_base_monthly:{eligible:!state.pos_base,requires:[]},
    restaurant_monthly:{eligible:state.pos_base&&!state.restaurant,requires:["pos_base_monthly"]},
    table_qr_monthly:{eligible:state.pos_base&&state.restaurant&&!state.table_qr,requires:["pos_base_monthly","restaurant_monthly"]},
    download_license:{eligible:true,requires:[]},
  };

  const latestEntitlement=new Map();
  for(const row of entitlements.rows){if(!latestEntitlement.has(row.code))latestEntitlement.set(row.code,row)}

  send(res,200,{
    features:state,
    featureRows:features.rows,
    plans:plans.rows.map(plan=>{
      const ent=latestEntitlement.get(plan.code)||null;
      const dependency=dependencyState[plan.code]||{eligible:true,requires:[]};
      const active=plan.code==="pos_base_monthly"?state.pos_base:plan.code==="restaurant_monthly"?state.restaurant:plan.code==="table_qr_monthly"?state.table_qr:Boolean(ent&&ent.status==="active");
      return {
        code:plan.code,
        name:plan.name,
        billingType:plan.billing_type,
        amount:(plan.monthly_net_cents??plan.amount_cents)/100,
        standardAmount:plan.amount_cents/100,
        specialNote:plan.special_note||null,
        currency:plan.currency,
        active,
        eligible:active?false:dependency.eligible,
        requires:dependency.requires,
        entitlement:ent?{status:ent.status,currentPeriodEnd:ent.current_period_end,purchasedAt:ent.purchased_at}:null
      };
    })
  });
  return true;
}
