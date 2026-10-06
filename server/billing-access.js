import crypto from "node:crypto";
import { Readable } from "node:stream";
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

async function licensedContext(req,res){
  const user=await currentUser(req);
  if(!user){ sendJson(res,401,{error:"Nicht angemeldet"}); return null; }
  const entitlement=await activeDownloadEntitlement(user.company_id);
  if(!entitlement){
    sendJson(res,402,{allowed:false,planCode:"download_license",error:"Download erst nach erfolgreicher Zahlung verfügbar.",purchaseRequired:true});
    return null;
  }
  const release=await latestWindowsRelease();
  if(!release){
    sendJson(res,503,{allowed:true,licenseActive:true,entitlement:{id:entitlement.id,purchasedAt:entitlement.purchased_at},releaseAvailable:false,error:"Die Lizenz ist aktiv, aber aktuell ist noch kein Windows-Installer veröffentlicht."});
    return null;
  }
  return {user,entitlement,release};
}

async function auditDownload(ctx,eventType){
  await pool.query(`
    INSERT INTO software_download_events(company_id,user_id,entitlement_id,release_id,event_type)
    VALUES($1,$2,$3,$4,$5)
  `,[ctx.user.company_id,ctx.user.id,ctx.entitlement.id,ctx.release.id,eventType]);
}

export async function handleBillingAccess(req,res){
  const url=new URL(req.url,"http://localhost");
  const paths=["/api/v1/downloads/windows/access","/api/v1/downloads/windows/latest","/api/v1/downloads/windows/file"];
  if(!paths.includes(url.pathname)) return false;
  if(req.method!=="GET"){ sendJson(res,405,{error:"Methode nicht erlaubt"}); return true; }

  const ctx=await licensedContext(req,res);
  if(!ctx) return true;

  if(url.pathname==="/api/v1/downloads/windows/file"){
    let upstream;
    try{
      upstream=await fetch(ctx.release.file_url,{redirect:"follow"});
    }catch(error){
      sendJson(res,502,{error:"Windows-Installer konnte nicht geladen werden."});
      return true;
    }
    if(!upstream.ok||!upstream.body){
      sendJson(res,502,{error:"Windows-Installer ist beim Release-Speicher nicht verfügbar."});
      return true;
    }
    await auditDownload(ctx,"download_started");
    const version=String(ctx.release.version||"current").replace(/[^A-Za-z0-9._-]/g,"-");
    const headers={
      "content-type":upstream.headers.get("content-type")||"application/octet-stream",
      "content-disposition":`attachment; filename="Bringness-POS-Setup-${version}.exe"`,
      "cache-control":"private, no-store"
    };
    const length=upstream.headers.get("content-length");
    if(length) headers["content-length"]=length;
    res.writeHead(200,headers);
    Readable.fromWeb(upstream.body).pipe(res);
    return true;
  }

  await auditDownload(ctx,"download_access_checked");
  sendJson(res,200,{
    allowed:true,
    licenseActive:true,
    planCode:"download_license",
    entitlement:{id:ctx.entitlement.id,purchasedAt:ctx.entitlement.purchased_at},
    release:{
      channel:ctx.release.channel,
      platform:ctx.release.platform,
      version:ctx.release.version,
      sha256:ctx.release.sha256||null,
      protectedDownloadPath:"/api/v1/downloads/windows/file"
    }
  });
  return true;
}
