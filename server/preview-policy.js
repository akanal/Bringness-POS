import crypto from 'node:crypto';
const host='demo.bringness-pos.de';
const digest=value=>crypto.createHash('sha256').update(value).digest();
const equal=(a,b)=>crypto.timingSafeEqual(digest(a),digest(b));
const reject=key=>{throw Error('Unsafe isolated preview configuration: '+key);};
let previewInstalled=false;
export function markPreviewRuntimeInstalled(){previewInstalled=true;}
export function assertPreviewEntrypoint(env=process.env){if(isolatedPreview(env)&&!previewInstalled)reject('use start:preview entrypoint');}
export const isolatedPreview=(env=process.env)=>env.BRINGNESS_PREVIEW_MODE==='isolated';
export function validatePreviewEnvironment(env=process.env){
 if(!isolatedPreview(env))reject('BRINGNESS_PREVIEW_MODE');
 for(const [key,value] of Object.entries({NODE_ENV:'development',APP_MODE:'combined',PORT:'3000',PREVIEW_HOST:host,PUBLIC_BASE_URL:'https://'+host,PUBLIC_URL:'https://'+host,AI_DATABASE_NAME:'bringness_ai_preview',PREVIEW_ACCESS_USER:'bringness-preview'}))if(env[key]!==value)reject(key);
 for(const [key,value] of Object.entries(env))if(/^(MOLLIE_|FISKALY_|SMTP_|VAPID_|NETCUP_|RAILWAY_|AWS_|S3_|IDRIVE_|WINDOWS_CSC_)/.test(key)&&value)reject(key);
 const secrets=['PREVIEW_ACCESS_PASSWORD','PREVIEW_SESSION_SECRET','PASSWORD_PEPPER','AI_DB_PASSWORD'];
 for(const key of secrets)if(typeof env[key]!=='string'||!/^[A-Za-z0-9_-]{32,}$/.test(env[key]))reject(key);
 if(new Set(secrets.map(key=>env[key])).size!==secrets.length)reject('distinct secrets');
 if(typeof env.PREVIEW_OWNER_PASSWORD!=='string'||env.PREVIEW_OWNER_PASSWORD.length<32||!/\p{Lu}/u.test(env.PREVIEW_OWNER_PASSWORD)||!/\p{Ll}/u.test(env.PREVIEW_OWNER_PASSWORD)||!/\d/.test(env.PREVIEW_OWNER_PASSWORD)||!/[!@#$%^&*]/.test(env.PREVIEW_OWNER_PASSWORD))reject('PREVIEW_OWNER_PASSWORD');
 let db;try{db=new URL(env.DATABASE_URL);}catch{reject('DATABASE_URL');}
 if(!['postgres:','postgresql:'].includes(db.protocol)||db.hostname!=='preview-db'||decodeURIComponent(db.username)!=='preview_admin'||db.pathname!=='/bringness_preview'||db.port&&db.port!=='5432'||db.search||db.hash||!/^[A-Za-z0-9_-]{32,}$/.test(decodeURIComponent(db.password)))reject('DATABASE_URL');
 if(secrets.some(key=>env[key]===decodeURIComponent(db.password)))reject('distinct database password');
 return {host,accessUser:env.PREVIEW_ACCESS_USER,accessPassword:env.PREVIEW_ACCESS_PASSWORD,sessionSecret:env.PREVIEW_SESSION_SECRET};
}
const cookieName='bringness_preview_access';
export function createPreviewAccess(policy,{clock=Date.now}={}){
 const sign=expiry=>crypto.createHmac('sha256',policy.sessionSecret).update('preview:'+expiry).digest('hex');
 const basicExpected=policy.accessUser+':'+policy.accessPassword;
 return (req,res)=>{
  res.setHeader('content-security-policy',"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' data: blob:; font-src 'self' data:; worker-src 'self' blob:; connect-src 'self'; frame-src 'self'; frame-ancestors 'self'; form-action 'self'; base-uri 'self'; object-src 'none'");
  res.setHeader('x-robots-tag','noindex, nofollow, noarchive');res.setHeader('cache-control','no-store');res.setHeader('referrer-policy','no-referrer');res.setHeader('x-frame-options','SAMEORIGIN');
  const authorization=String(req.headers.authorization||'');let basic=false;
  if(/^Basic\s+/i.test(authorization)){
   const encoded=authorization.replace(/^Basic\s+/i,'');if(/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)){const value=Buffer.from(encoded,'base64').toString('utf8');basic=equal(value,basicExpected);}
  }
  const raw=String(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(cookieName+'='))?.slice(cookieName.length+1);
  let validCookie=false;
  if(raw&&/^\d{10}\.[a-f0-9]{64}$/.test(raw)){
   const [expiry,signature]=raw.split('.'),seconds=Math.floor(clock()/1000);
   validCookie=Number(expiry)>seconds&&Number(expiry)<=seconds+3600&&equal(signature,sign(expiry));
  }
  if(basic){const expiry=String(Math.floor(clock()/1000)+3600);res.setHeader('set-cookie',cookieName+'='+expiry+'.'+sign(expiry)+'; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=3600');}
  if(basic||validCookie){
   let path=new URL(req.url||'/', 'https://'+policy.host).pathname;try{path=decodeURIComponent(path);}catch{}
   if(!['GET','HEAD','OPTIONS'].includes(req.method||'GET')&&(/^(?:\/api\/v1\/(?:billing\/(?:checkout|cancel)|mollie|fiskaly-test|tse|platform\/control)|\/api\/ai\/(?:admin\/collection|collection|automatic-procurement))(?:\/|$)/i.test(path)||/\/mollie\//i.test(path))){
    res.writeHead(403,{'content-type':'application/json'});res.end(JSON.stringify({error:'Externe Zahlungs-, Fiskal- und Verwaltungsaktionen sind in dieser Vorschau gesperrt',code:'PREVIEW_ACTION_DISABLED'}));return true;
   }
   return false;
  }
  res.writeHead(401,{'content-type':'application/json','www-authenticate':'Basic realm="Bringness isolated preview", charset="UTF-8"'});res.end(JSON.stringify({error:'Geschützter Vorschauzugang erforderlich'}));return true;
 };
}
export function blockedPreviewFetch(){throw Object.assign(Error('External requests disabled in isolated preview'),{code:'PREVIEW_EGRESS_BLOCKED'});}
