import crypto from 'node:crypto';
export function packageRequirement(path){
 if(path.startsWith('/api/v1/platform/'))return null;
 if(path.startsWith('/api/v1/displays')||path.startsWith('/api/v1/centers')&&!['/api/v1/centers/mollie/webhook','/api/v1/centers/mollie/callback'].includes(path)||/^\/api\/v1\/personnel\/(report|correct|schedules)$/.test(path)||/^\/api\/v1\/owner\/(schedules|presence)$/.test(path))return 'restaurant';
 if(path.startsWith('/api/v1/waiter/')&&!path.startsWith('/api/v1/waiter/push/receipt/')||path.startsWith('/api/v1/waiters')||path.startsWith('/api/v1/owner/tables/'))return 'table_service';
 return null;
}
export function createPackageAccess(pool){return async(req,res)=>{
 const requirement=packageRequirement(new URL(req.url,'http://local').pathname);if(!requirement)return false;
 const raw=String(req.headers.authorization||'').replace(/^Bearer\s+/i,'');if(!raw)return false;
 const user=(await pool.query("SELECT u.company_id,EXISTS(SELECT 1 FROM platform_admins pa WHERE pa.user_id=u.id AND pa.active=true) platform_admin FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now() AND u.status='active'",[crypto.createHash('sha256').update(raw).digest('hex')])).rows[0];if(!user||user.platform_admin)return false;
 const active=code=>pool.query("SELECT 1 FROM company_features WHERE company_id=$1 AND feature_code=$2 AND status='active' AND ((ends_at IS NULL OR ends_at>now()) OR (grace_until IS NOT NULL AND grace_until>now()))",[user.company_id,code]);
 if((await active('restaurant')).rowCount)return false;
 if(requirement==='table_service'&&(await active('table_qr')).rowCount){if((await active('pos_base')).rowCount||(await pool.query("SELECT 1 FROM company_entitlements ce JOIN billing_plans bp ON bp.id=ce.plan_id WHERE ce.company_id=$1 AND bp.code='download_license' AND ce.status='active'",[user.company_id])).rowCount)return false;}
 res.writeHead(402,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify({error:'Diese Funktion ist in Ihrer Lizenz nicht enthalten.',feature:requirement,upgradeRequired:true}));return true;
};}
