import crypto from "node:crypto";
import pg from "pg";

const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.NODE_ENV==="production"?{rejectUnauthorized:false}:false});
const codes={pos_base_monthly:"pos_base",restaurant_monthly:"restaurant",table_qr_monthly:"table_qr"};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const send=(res,status,value)=>{res.writeHead(status,{"content-type":"application/json","cache-control":"no-store"});res.end(JSON.stringify(value))};
async function body(req){let raw="";for await(const chunk of req){raw+=chunk;if(raw.length>8192)throw Error("Anfrage zu groß")}return raw?JSON.parse(raw):{}}

export async function migrateBillingTerms(){
  await pool.query(`CREATE TABLE IF NOT EXISTS company_billing_terms(
    company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    plan_code text NOT NULL REFERENCES billing_plans(code),
    monthly_net_cents int NOT NULL CHECK(monthly_net_cents>0),
    note text NOT NULL DEFAULT '',
    updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY(company_id,plan_code));
  CREATE TABLE IF NOT EXISTS company_trials(
    company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    plan_code text NOT NULL REFERENCES billing_plans(code),
    starts_at timestamptz NOT NULL DEFAULT now(),
    ends_at timestamptz NOT NULL,
    note text NOT NULL DEFAULT '',
    created_by uuid REFERENCES users(id) ON DELETE SET NULL,
    PRIMARY KEY(company_id,plan_code));`);
}

export async function handleBillingTerms(req,res){
  const url=new URL(req.url,"http://localhost"),p=url.pathname;
  if(!["/api/v1/platform/terms","/api/v1/platform/trials"].includes(p))return false;
  const token=String(req.headers.authorization||"").replace(/^Bearer\s+/i,"");
  if(!token){send(res,403,{error:"Nur Plattformadministratoren"});return true}
  const actor=(await pool.query(`SELECT u.id FROM sessions s JOIN users u ON u.id=s.user_id
    JOIN platform_admins pa ON pa.user_id=u.id AND pa.active=true
    WHERE s.token_hash=$1 AND s.expires_at>now() AND u.status='active'`,[crypto.createHash("sha256").update(token).digest("hex")])).rows[0];
  if(!actor){send(res,403,{error:"Nur Plattformadministratoren"});return true}
  if(req.method==="GET"){
    const companyId=url.searchParams.get("companyId");if(!uuid.test(companyId||"")){send(res,400,{error:"Kundenkonto erforderlich"});return true}
    const [terms,trials]=await Promise.all([
      pool.query("SELECT plan_code,monthly_net_cents,note,updated_at FROM company_billing_terms WHERE company_id=$1 ORDER BY plan_code",[companyId]),
      pool.query("SELECT plan_code,starts_at,ends_at,note FROM company_trials WHERE company_id=$1 ORDER BY plan_code",[companyId])
    ]);
    send(res,200,{terms:terms.rows,trials:trials.rows});return true;
  }
  let input;try{input=await body(req)}catch{send(res,400,{error:"Ungültige Anfrage"});return true}
  const companyId=String(input.companyId||""),planCode=String(input.planCode||""),note=String(input.note||"").trim();
  if(!uuid.test(companyId)||!codes[planCode]||note.length>500){send(res,400,{error:"Kunde, Monatstarif oder Notiz ungültig"});return true}
  if(p==="/api/v1/platform/terms"&&req.method==="DELETE"){
    const q=await pool.query("DELETE FROM company_billing_terms WHERE company_id=$1 AND plan_code=$2 RETURNING monthly_net_cents",[companyId,planCode]);
    if(!q.rowCount){send(res,404,{error:"Keine Sonderkondition vorhanden"});return true}
    await pool.query("INSERT INTO audit_log(company_id,actor_user_id,event_type,entity_type,entity_id,payload) VALUES($1,$2,'platform.billing.terms.removed','company',$3,$4)",[companyId,actor.id,companyId,JSON.stringify({planCode,monthlyNetCents:q.rows[0].monthly_net_cents})]);
    send(res,200,{ok:true,message:"Sonderpreis für neue Abos entfernt. Laufende Abos bleiben unverändert."});return true;
  }
  if(p==="/api/v1/platform/terms"&&req.method==="PUT"){
    const net=Number(input.monthlyNetCents),plan=(await pool.query("SELECT amount_cents FROM billing_plans WHERE code=$1 AND billing_type='monthly'",[planCode])).rows[0];
    if(!plan||!Number.isInteger(net)||net<1||net>plan.amount_cents){send(res,400,{error:"Sonderpreis muss zwischen 0,01 € und dem regulären Nettopreis liegen"});return true}
    const q=await pool.query(`INSERT INTO company_billing_terms(company_id,plan_code,monthly_net_cents,note,updated_by)
      SELECT id,$2,$3,$4,$5 FROM companies WHERE id=$1
      ON CONFLICT(company_id,plan_code) DO UPDATE SET monthly_net_cents=EXCLUDED.monthly_net_cents,note=EXCLUDED.note,updated_by=EXCLUDED.updated_by,updated_at=now()
      RETURNING plan_code,monthly_net_cents,note`,[companyId,planCode,net,note,actor.id]);
    if(!q.rowCount){send(res,404,{error:"Kunde nicht gefunden"});return true}
    await pool.query("INSERT INTO audit_log(company_id,actor_user_id,event_type,entity_type,entity_id,payload) VALUES($1,$2,'platform.billing.terms','company',$3,$4)",[companyId,actor.id,companyId,JSON.stringify({planCode,monthlyNetCents:net,note})]);
    send(res,200,{term:q.rows[0],message:"Sonderpreis gilt für neue Abos. Laufende Abos bleiben unverändert."});return true;
  }
  if(p==="/api/v1/platform/trials"&&req.method==="POST"){
    const days=Number(input.days);if(!Number.isInteger(days)||days<1||days>90){send(res,400,{error:"Testphase muss 1 bis 90 Tage dauern"});return true}
    const client=await pool.connect();
    try{
      await client.query("BEGIN");
      const company=await client.query("SELECT id FROM companies WHERE id=$1 FOR UPDATE",[companyId]);
      if(!company.rowCount){await client.query("ROLLBACK");send(res,404,{error:"Kunde nicht gefunden"});return true}
      const download=await client.query("SELECT 1 FROM company_entitlements ce JOIN billing_plans bp ON bp.id=ce.plan_id WHERE ce.company_id=$1 AND bp.code='download_license' AND ce.status='active'",[companyId]);
      if(download.rowCount){await client.query("ROLLBACK");send(res,409,{error:"Die Download-Lizenz enthält nur die normale Kasse; Restaurant- und Tisch-QR-Testphasen sind ausgeschlossen."});return true}
      const prior=await client.query("SELECT 1 FROM company_trials WHERE company_id=$1 AND plan_code=$2",[companyId,planCode]);
      if(prior.rowCount){await client.query("ROLLBACK");send(res,409,{error:"Für diesen Tarif gab es bereits eine Testphase"});return true}
      const paid=await client.query(`SELECT 1 FROM company_entitlements ce JOIN billing_plans bp ON bp.id=ce.plan_id
        WHERE ce.company_id=$1 AND bp.code=$2 AND ce.status='active' AND (ce.current_period_end IS NULL OR ce.current_period_end>now())`,[companyId,planCode]);
      if(paid.rowCount){await client.query("ROLLBACK");send(res,409,{error:"Ein bezahltes Abo ist bereits aktiv"});return true}
      const existing=await client.query("SELECT 1 FROM company_features WHERE company_id=$1 AND feature_code=$2 AND status='active' AND (ends_at IS NULL OR ends_at>now())",[companyId,codes[planCode]]);
      if(existing.rowCount){await client.query("ROLLBACK");send(res,409,{error:"Das Modul ist bereits aktiv"});return true}
      if(planCode==="table_qr_monthly"){
        const required="restaurant";
        const parent=await client.query("SELECT 1 FROM company_features WHERE company_id=$1 AND feature_code=$2 AND status='active' AND (ends_at IS NULL OR ends_at>now())",[companyId,required]);
        if(!parent.rowCount){await client.query("ROLLBACK");send(res,409,{error:"Zuerst das erforderliche Basis-Modul aktivieren"});return true}
      }
      const trial=(await client.query(`INSERT INTO company_trials(company_id,plan_code,ends_at,note,created_by)
        VALUES($1,$2,now()+($3::int * interval '1 day'),$4,$5) RETURNING plan_code,starts_at,ends_at,note`,[companyId,planCode,days,note,actor.id])).rows[0];
      await client.query(`INSERT INTO company_features(company_id,feature_code,status,starts_at,ends_at,grace_until,payment_status)
        VALUES($1,$2,'active',now(),$3,NULL,'trial')
        ON CONFLICT(company_id,feature_code) DO UPDATE SET status='active',starts_at=now(),ends_at=EXCLUDED.ends_at,grace_until=NULL,payment_status='trial'`,[companyId,codes[planCode],trial.ends_at]);
      await client.query("INSERT INTO audit_log(company_id,actor_user_id,event_type,entity_type,entity_id,payload) VALUES($1,$2,'platform.billing.trial','company',$3,$4)",[companyId,actor.id,companyId,JSON.stringify({planCode,days,note,endsAt:trial.ends_at})]);
      await client.query("COMMIT");send(res,201,{trial,message:"Testphase gestartet. Es erfolgt keine automatische Abbuchung."});return true;
    }catch(error){await client.query("ROLLBACK");throw error}finally{client.release()}
  }
  if(p==="/api/v1/platform/trials"&&req.method==="DELETE"){
    const client=await pool.connect();
    try{
      await client.query("BEGIN");
      const q=await client.query("UPDATE company_trials SET ends_at=now() WHERE company_id=$1 AND plan_code=$2 AND ends_at>now() RETURNING ends_at",[companyId,planCode]);
      if(!q.rowCount){await client.query("ROLLBACK");send(res,404,{error:"Keine laufende Testphase"});return true}
      await client.query("UPDATE company_features SET ends_at=now() WHERE company_id=$1 AND feature_code=$2 AND payment_status='trial'",[companyId,codes[planCode]]);
      await client.query("INSERT INTO audit_log(company_id,actor_user_id,event_type,entity_type,entity_id,payload) VALUES($1,$2,'platform.billing.trial.ended','company',$3,$4)",[companyId,actor.id,companyId,JSON.stringify({planCode})]);
      await client.query("COMMIT");send(res,200,{ok:true});return true;
    }catch(error){await client.query("ROLLBACK");throw error}finally{client.release()}
  }
  send(res,405,{error:"Methode nicht erlaubt"});return true;
}
