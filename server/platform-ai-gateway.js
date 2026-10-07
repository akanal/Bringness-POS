import crypto from 'node:crypto';
const prefix='/api/v1/platform/ai';
export function createPlatformAiGateway(pool,{fetcher=fetch,origin='https://bringness-ai.com'}={}) {
 const base=new URL(origin);
 if(base.protocol!=='https:'||base.username||base.password||base.pathname!=='/'||base.search||base.hash)throw Error('Invalid AI administration origin');
 return async function handle(req,res) {
  const url=new URL(req.url,'http://local');
  if(url.pathname!==prefix&&!url.pathname.startsWith(prefix+'/'))return false;
  const send=(status,data)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(data));return true};
  const token=String(req.headers.authorization||'').replace(/^Bearer\s+/i,'');
  if(!token)return send(401,{error:'Bitte als Plattforminhaber anmelden.'});
  const actor=(await pool.query(`SELECT u.id FROM sessions s JOIN users u ON u.id=s.user_id JOIN platform_admins a ON a.user_id=u.id AND a.active=true WHERE s.token_hash=$1 AND s.expires_at>now() AND u.status='active' AND NOT coalesce(u.must_change_password,false)`,[crypto.createHash('sha256').update(token).digest('hex')])).rows[0];
  if(!actor)return send(403,{error:'Nur Bringness-Plattformadministratoren.'});
  const suffix=url.pathname.slice(prefix.length);
  if(!/^\/(?:[a-z0-9-]+\/?)*$/.test(suffix)||suffix.includes('//')||url.search.length>2048)return send(400,{error:'Ungültige Admin-Adresse.'});
  if(!['GET','POST'].includes(req.method))return send(405,{error:'Methode nicht erlaubt.'});
  let body='';for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>16000)return send(413,{error:'Anfrage zu groß.'})}
  if(req.method==='GET'&&body)return send(400,{error:'GET ohne Nutzdaten verwenden.'});
  try{
   const response=await fetcher(new URL('/api/ai/admin'+(suffix==='/'?'':suffix)+url.search,base),{method:req.method,redirect:'error',signal:AbortSignal.timeout(15000),headers:{authorization:'Bearer '+token,'content-type':'application/json'},...(req.method==='POST'?{body:body||'{}'}:{})});
   if(!response.headers.get('content-type')?.includes('application/json'))throw Error('Invalid upstream response');
   const chunks=[];let size=0;for await(const chunk of response.body){const bytes=Buffer.from(chunk);size+=bytes.length;if(size>2*1024*1024)throw Error('Response too large');chunks.push(bytes)}
   return send(response.status,JSON.parse(Buffer.concat(chunks).toString('utf8')));
  }catch{return send(503,{error:'AI-Verwaltung momentan nicht erreichbar. Bitte erneut laden; Änderungen nicht ungeprüft wiederholen.'})}
 };
}
