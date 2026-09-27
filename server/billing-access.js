import crypto from "node:crypto";
import pg from "pg";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
});

function sendJson(res,status,payload){
  res.writeHead(status,{"content-type":"application/json","cache-control":"no-store"});
  res.end(JSON.stringify(payload));
}

function bearer(req){
  return String(req.headers.authorization||"").replace(/^Bearer\s+/i,"");
}

async function currentUser(req){
  const token=bearer(req);
  if(!token) return null;
  const tokenHash=crypto.createHash("sha256").update(token).digest("hex");
  const q=await pool.query(`
    SELECT u.id,u.company_id,u.email,u.display_name,u.role
    FROM sessions s JOIN users u ON u.id=s.user_id
    WHERE s.token_hash=$1 AND s.expires_at>now() AND u.status='active'
  `,[tokenHash]);
  return q.rows[0]||null;
}

export async function migrateBillingAccess(){
  await pool.query(`
    UPDATE billing_plans
    SET amount_cents=39900,currency='EUR',active=true
    WHERE code='download_license';

    CREATE TABLE IF NOT EXISTS software_releases(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      channel text NOT NULL DEFAULT 'stable',
      platform text NOT NULL DEFAULT 'windows',
      version text NOT NULL,
      file_url text NOT NULL,
      sha256 text,
      active boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(channel,platform,version)
    );

    CREATE TABLE IF NOT EXISTS software_download_events(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      user_id uuid REFERENCES users(id) ON DELETE SET NULL,
      entitlement_id uuid REFERENCES company_entitlements(id) ON DELETE SET NULL,
      release_id uuid REFERENCES software_releases(id) ON DELETE SET NULL,
      event_type text NOT NULL DEFAULT 'download_granted',
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `);
}

async function activeDownloadEntitlement(companyId){
  const q=await pool.query(`
    SELECT ce.id,ce.purchased_at,ce.provider_reference,bp.code,bp.name
    FROM company_entitlements ce
    JOIN billing_plans bp ON bp.id=ce.plan_id
    WHERE ce.company_id=$1
      AND bp.code='download_license'
      AND ce.status='active'
    ORDER BY ce.purchased_at DESC NULLS LAST,ce.created_at DESC
    LIMIT 1
  `,[companyId]);
  return q.rows[0]||null;
}

async function latestWindowsRelease(){
  const configured=String(process.env.DESKTOP_INSTALLER_URL||"").trim();
  if(configured){
    return {
      id:null,
      channel:"stable",
      platform:"windows",
      version:String(process.env.DESKTOP_INSTALLER_VERSION||"current"),
      file_url:configured,
      sha256:String(process.env.DESKTOP_INSTALLER_SHA256||"").trim()||null,
      source:"environment"
    };
  }
  const q=await pool.query(`
    SELECT id,channel,platform,version,file_url,sha256
    FROM software_releases
    WHERE active=true AND platform='windows' AND channel='stable'
    ORDER BY created_at DESC
    LIMIT 1
  `);
  return q.rows[0]?{...q.rows[0],source:"database"}:null;
}

export async function handleBillingAccess(req,res){
  const url=new URL(req.url,"http://localhost");
  if(!["/api/v1/downloads/windows/access","/api/v1/downloads/windows/latest"].includes(url.pathname)) return false;
  if(req.method!=="GET"){ sendJson(res,405,{error:"Methode nicht erlaubt"}); return true; }

  const user=await currentUser(req);
  if(!user){ sendJson(res,401,{error:"Nicht angemeldet"}); return true; }

  const entitlement=await activeDownloadEntitlement(user.company_id);
  if(!entitlement){
    sendJson(res,402,{
      allowed:false,
      planCode:"download_license",
      error:"Download erst nach erfolgreicher Zahlung verfügbar.",
      purchaseRequired:true
    });
    return true;
  }

  const release=await latestWindowsRelease();
  if(!release){
    sendJson(res,503,{
      allowed:true,
      licenseActive:true,
      entitlement:{id:entitlement.id,purchasedAt:entitlement.purchased_at},
      releaseAvailable:false,
      error:"Die Lizenz ist aktiv, aber aktuell ist noch kein Windows-Installer veröffentlicht."
    });
    return true;
  }

  await pool.query(`
    INSERT INTO software_download_events(company_id,user_id,entitlement_id,release_id,event_type)
    VALUES($1,$2,$3,$4,'download_granted')
  `,[user.company_id,user.id,entitlement.id,release.id]);

  sendJson(res,200,{
    allowed:true,
    licenseActive:true,
    planCode:"download_license",
    entitlement:{id:entitlement.id,purchasedAt:entitlement.purchased_at},
    release:{
      channel:release.channel,
      platform:release.platform,
      version:release.version,
      downloadUrl:release.file_url,
      sha256:release.sha256||null
    }
  });
  return true;
}
