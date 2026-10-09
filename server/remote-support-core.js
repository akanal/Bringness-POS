import crypto from 'node:crypto';
export const supportUuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function supportInput(b){
 const error=()=>{throw Object.assign(Error('Ungültige Fernhilfeaktion'),{status:400})};
 if(!['click','text','key','scroll','reload'].includes(b.type))error();
 if(!Number.isSafeInteger(b.frameSequence)||b.frameSequence<1)error();
 const input={type:b.type,frameSequence:b.frameSequence};
 if(b.type==='click'){if(!Number.isInteger(b.x)||!Number.isInteger(b.y)||b.x<0||b.y<0||b.x>1920||b.y>1080)error();Object.assign(input,{x:b.x,y:b.y})}
 if(b.type==='scroll'){if(!Number.isInteger(b.delta)||Math.abs(b.delta)>500||b.delta===0)error();input.delta=b.delta}
 if(b.type==='text'){if(typeof b.text!=='string'||b.text.length<1||b.text.length>100||/[\x00-\x1f\x7f]/.test(b.text))error();input.text=b.text}
 if(b.type==='key'){if(!['Enter','Tab','Backspace','Escape','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(b.key))error();input.key=b.key}
 return input;
}
export function safeDiagnostics(b={}){
 const text=(v,n=80)=>typeof v==='string'?v.slice(0,n):'';
 const count=v=>Number.isSafeInteger(v)&&v>=0&&v<=1000000?v:null;
 return {appVersion:text(b.appVersion,40),platform:text(b.platform,20),supportProtocol:b.supportProtocol===1?1:0,online:b.online===true,licenseBlocked:b.licenseBlocked===true,pendingOfflineSales:count(b.pendingOfflineSales),lastSync:text(b.lastSync,40)};
}
const sha=v=>crypto.createHash('sha256').update(v).digest('hex');
export function createRemoteSupport(pool){
 return async function handle(req,res){
  const url=new URL(req.url,'http://local'),p=url.pathname;
  if(!p.startsWith('/api/v1/remote-support/'))return false;
  const send=(status,d)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(d));return true};
  try{
   const token=String(req.headers.authorization||'').replace(/^Bearer\s+/i,'');
   const user=token?(await pool.query(`SELECT u.id,u.company_id,u.role,EXISTS(SELECT 1 FROM platform_admins a WHERE a.user_id=u.id AND a.active) platform_admin FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now() AND u.status='active' AND NOT coalesce(u.must_change_password,false)`,[sha(token)])).rows[0]:null;
   if(!user)return send(401,{error:'Bitte anmelden.'});
   const adminPath=!p.startsWith('/api/v1/remote-support/device/');
   if(adminPath&&!user.platform_admin)return send(403,{error:'Nur Plattformadministratoren.'});

   let b={};if(req.method==='POST'){let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>250000)return send(413,{error:'Anfrage zu groß.'})}try{b=JSON.parse(raw||'{}')}catch{return send(400,{error:'Ungültige Anfrage.'})}}
   await cleanupRemoteSupport(pool);
   if(p==='/api/v1/remote-support/devices'&&req.method==='GET')return send(200,{devices:(await pool.query(`SELECT d.id,d.name,d.app_version,d.status,d.last_seen_at,d.support_diagnostics,d.support_grant,c.name company_name,rs.id session_id,rs.state session_state,rs.expires_at FROM devices d JOIN companies c ON c.id=d.company_id LEFT JOIN remote_support_sessions rs ON rs.device_id=d.id AND rs.state IN ('requested','active') WHERE d.platform IN ('windows','win32') ORDER BY d.last_seen_at DESC NULLS LAST LIMIT 500`)).rows,limit:500});
   let device;
   if(!adminPath){if(!/^[a-f0-9]{64}$/.test(b.deviceKey||''))return send(400,{error:'Ungültiges Gerät.'});device=(await pool.query("SELECT id,company_id,status,support_grant FROM devices WHERE device_key=$1 AND company_id=$2 AND status='active'",[b.deviceKey,user.company_id])).rows[0];if(!device)return send(403,{error:'Gerät nicht freigegeben.'})}
   const owner=['owner','admin'].includes(user.role);
   if(!adminPath&&!owner&&!device.support_grant?.enabled)return send(403,{error:'Fernhilfe benötigt eine Freigabe des Inhabers für dieses Gerät.'});
   if(p==='/api/v1/remote-support/device/grant'&&req.method==='POST'){
    if(!owner)return send(403,{error:'Nur Inhaber und Administratoren dürfen die dauerhafte Freigabe ändern.'});
    if(typeof b.enabled!=='boolean'||typeof b.controlAllowed!=='boolean')return send(400,{error:'Ungültige Freigabe.'});
    const c=await pool.connect();try{
     await c.query('BEGIN');await c.query('SELECT id FROM devices WHERE id=$1 FOR UPDATE',[device.id]);
     const grant={enabled:b.enabled,controlAllowed:b.enabled&&b.controlAllowed,grantedBy:user.id,updatedAt:new Date().toISOString()};
     await c.query('UPDATE devices SET support_grant=$2::jsonb WHERE id=$1',[device.id,JSON.stringify(grant)]);
     // A change in consent ends current sessions and removes their screen data.
     await c.query("UPDATE remote_support_sessions SET state='ended',ended_at=now(),frame=NULL WHERE device_id=$1 AND state IN ('requested','active')",[device.id]);
     await c.query("UPDATE remote_support_inputs SET state='cancelled',input=input-'text' WHERE session_id IN (SELECT id FROM remote_support_sessions WHERE device_id=$1) AND state IN ('queued','delivered')",[device.id]);
     await c.query("INSERT INTO audit_log(company_id,actor_user_id,event_type,entity_type,entity_id,payload) VALUES($1,$2,'remote_support.grant','device',$3,$4::jsonb)",[device.company_id,user.id,device.id,JSON.stringify(grant)]);
     await c.query('COMMIT');return send(200,{grant});
    }catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}
   }
   if(p==='/api/v1/remote-support/device/poll'&&req.method==='POST'){
    const diagnostics=safeDiagnostics(b.diagnostics);if(b.diagnostics)await pool.query('UPDATE devices SET support_diagnostics=$2::jsonb,last_seen_at=now() WHERE id=$1',[device.id,JSON.stringify(diagnostics)]);
    const session=(await pool.query("SELECT id,state,expires_at,control_allowed,persistent_consent FROM remote_support_sessions WHERE device_id=$1 AND state IN ('requested','active') ORDER BY created_at DESC LIMIT 1",[device.id])).rows[0];
    if(!session)return send(200,{session:null,commands:[],grant:device.support_grant,canGrant:owner});
    const commands=session.state==='active'?(await pool.query(`UPDATE remote_support_inputs SET state='delivered',delivered_at=now() WHERE id IN (SELECT id FROM remote_support_inputs WHERE session_id=$1 AND state='queued' AND created_at>now()-interval '15 seconds' ORDER BY created_at,id LIMIT 1 FOR UPDATE SKIP LOCKED) RETURNING id,input,created_at`,[session.id])).rows:[];
    await pool.query("UPDATE remote_support_inputs SET state='expired',input=input-'text' WHERE session_id=$1 AND state='queued' AND created_at<=now()-interval '15 seconds'",[session.id]);return send(200,{session,commands,grant:device.support_grant,canGrant:owner});
   }
   if(p==='/api/v1/remote-support/start'&&req.method==='POST'){
    if(!supportUuid.test(b.deviceId||''))return send(400,{error:'Ungültiges Gerät.'});
    const c=await pool.connect();try{await c.query('BEGIN');const d=(await c.query('SELECT id,company_id,status,last_seen_at,support_diagnostics FROM devices WHERE id=$1 FOR UPDATE',[b.deviceId])).rows[0];
     if(!d||d.status!=='active'||d.support_diagnostics?.supportProtocol!==1||d.support_diagnostics?.licenseBlocked||!d.last_seen_at||Date.now()-new Date(d.last_seen_at)>120000){await c.query('ROLLBACK');return send(409,{error:'Gerät benötigt den neuen Windows-Client, eine Adminanmeldung und eine aktuelle Online-Verbindung.'})}
     const existing=(await c.query("SELECT id FROM remote_support_sessions WHERE device_id=$1 AND state IN ('requested','active')",[d.id])).rows[0];if(existing){await c.query('ROLLBACK');return send(409,{error:'Für dieses Gerät läuft bereits eine Anfrage oder Sitzung.'})}
     const s=(await c.query("INSERT INTO remote_support_sessions(device_id,company_id,created_by,created_session_hash,expires_at) VALUES($1,$2,$3,$4,now()+interval '5 minutes') RETURNING id,state,expires_at",[d.id,d.company_id,user.id,sha(token)])).rows[0];
     await c.query("INSERT INTO audit_log(company_id,actor_user_id,event_type,entity_type,entity_id,payload) VALUES($1,$2,'remote_support.requested','device',$3,$4::jsonb)",[d.company_id,user.id,d.id,JSON.stringify({sessionId:s.id})]);await c.query('COMMIT');return send(201,s);
    }catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}
   }
   const match=p.match(/^\/api\/v1\/remote-support\/(?:device\/)?sessions\/([^/]+)(?:\/(accept|frame|ack|stop|input))?$/);
   if(!match||!supportUuid.test(match[1]))return send(404,{error:'Fernhilfefunktion nicht gefunden.'});
   const c=await pool.connect();try{
    await c.query('BEGIN');
    if(!adminPath){device=(await c.query('SELECT id,company_id,status,support_grant FROM devices WHERE id=$1 FOR UPDATE',[device.id])).rows[0];if(device.status!=='active'||!owner&&!device.support_grant?.enabled){await c.query('ROLLBACK');return send(403,{error:'Gerätefreigabe wurde widerrufen.'})}}
    const s=(await c.query('SELECT * FROM remote_support_sessions WHERE id=$1 FOR UPDATE',[match[1]])).rows[0];
    if(!s||(!adminPath&&s.device_id!==device.id)){await c.query('ROLLBACK');return send(404,{error:'Sitzung nicht gefunden.'})}
    const action=match[2]||'';
    if(req.method==='GET'&&adminPath&&!action){const inputs=(await c.query('SELECT id,input,state,error,created_at,acknowledged_at FROM remote_support_inputs WHERE session_id=$1 ORDER BY created_at DESC LIMIT 30',[s.id])).rows.map(row=>({...row,input:{...row.input,text:row.input.type==='text'?'[Texteingabe]':undefined}}));await c.query('COMMIT');return send(200,{session:{id:s.id,deviceId:s.device_id,state:s.state,expiresAt:s.expires_at,controlAllowed:s.control_allowed,frame:s.frame,frameSequence:s.frame_sequence,frameAt:s.frame_at,width:s.frame_width,height:s.frame_height},inputs})}
    if(req.method!=='POST'){await c.query('ROLLBACK');return send(405,{error:'Methode nicht erlaubt.'})}
    if(action==='stop'){
     await c.query("UPDATE remote_support_sessions SET state='ended',ended_at=coalesce(ended_at,now()),frame=NULL WHERE id=$1",[s.id]);await c.query("UPDATE remote_support_inputs SET state='cancelled',input=input-'text' WHERE session_id=$1 AND state='queued'",[s.id]);
    }else if(action==='accept'&&!adminPath){
     if(s.state!=='requested'||s.expires_at<=new Date()||typeof b.allowed!=='boolean'||typeof b.controlAllowed!=='boolean'){await c.query('ROLLBACK');return send(409,{error:'Anfrage abgelaufen oder bereits entschieden.'})}
     const fresh=(await c.query('SELECT support_grant FROM devices WHERE id=$1 FOR UPDATE',[device.id])).rows[0]?.support_grant;
     if(!owner&&(b.persistent!==true||!fresh?.enabled||b.controlAllowed&&!fresh.controlAllowed)){await c.query('ROLLBACK');return send(403,{error:'Keine passende dauerhafte Freigabe.'})}
     if(b.persistent===true&&!fresh?.enabled){await c.query('ROLLBACK');return send(403,{error:'Dauerhafte Freigabe wurde widerrufen.'})}
     const persistent=b.persistent===true&&fresh?.enabled;
     if(persistent&&b.controlAllowed&&!fresh.controlAllowed){await c.query('ROLLBACK');return send(403,{error:'Die dauerhafte Freigabe erlaubt nur Bildschirmansicht.'})}
     await c.query('UPDATE remote_support_sessions SET persistent_consent=$2 WHERE id=$1',[s.id,Boolean(persistent)]);
     await c.query("UPDATE remote_support_sessions SET state=$2,control_allowed=$3,accepted_by=$4,accepted_session_hash=$5,expires_at=now()+interval '15 minutes',ended_at=CASE WHEN $2='declined' THEN now() ELSE NULL END WHERE id=$1",[s.id,b.allowed?'active':'declined',b.allowed&&b.controlAllowed,user.id,sha(token)]);
    }else{
     if(s.state!=='active'||s.expires_at<=new Date()){await c.query('ROLLBACK');return send(409,{error:'Sitzung nicht aktiv.'})}
     if(!adminPath&&!(s.persistent_consent&&device.support_grant?.enabled)&&(s.accepted_by!==user.id||s.accepted_session_hash!==sha(token))){await c.query('ROLLBACK');return send(403,{error:'Sitzung gehört zu einer anderen Anmeldung.'})}
     if(action==='frame'&&!adminPath){
      if(typeof b.frame!=='string'||b.frame.length>220000||!/^\/9j\/[A-Za-z0-9+/=]+$/.test(b.frame)||!Number.isInteger(b.width)||!Number.isInteger(b.height)||b.width<1||b.width>1920||b.height<1||b.height>1080){await c.query('ROLLBACK');return send(400,{error:'Ungültiges Bildschirmbild.'})}
      const bytes=Buffer.from(b.frame,'base64');if(bytes[0]!==255||bytes[1]!==216||bytes.at(-2)!==255||bytes.at(-1)!==217){await c.query('ROLLBACK');return send(400,{error:'Ungültiges JPEG.'})}
      const result=(await c.query('UPDATE remote_support_sessions SET frame=$2,frame_width=$3,frame_height=$4,frame_sequence=frame_sequence+1,frame_at=now() WHERE id=$1 RETURNING frame_sequence',[s.id,b.frame,b.width,b.height])).rows[0];await c.query('COMMIT');return send(200,{frameSequence:result.frame_sequence});
     }else if(action==='input'&&adminPath){
      if(!s.control_allowed){await c.query('ROLLBACK');return send(403,{error:'Kunde hat nur Bildschirmansicht erlaubt.'})}
      const input=supportInput(b);if(input.frameSequence!==s.frame_sequence||!s.frame_at||Date.now()-new Date(s.frame_at)>10000||(input.type==='click'&&(input.x>=s.frame_width||input.y>=s.frame_height))){await c.query('ROLLBACK');return send(409,{error:'Bildschirm hat sich geändert. Aktuelles Bild laden.'})}
      const existing=(await c.query("SELECT id FROM remote_support_inputs WHERE session_id=$1 AND state IN ('queued','delivered') AND created_at>now()-interval '15 seconds'",[s.id])).rows[0];if(existing){await c.query('ROLLBACK');return send(409,{error:'Vorherige Aktion ist noch nicht bestätigt.'})}
      const inputRow=(await c.query('INSERT INTO remote_support_inputs(session_id,input,created_by) VALUES($1,$2::jsonb,$3) RETURNING id',[s.id,JSON.stringify(input),user.id])).rows[0];await c.query("INSERT INTO audit_log(company_id,actor_user_id,event_type,entity_type,entity_id,payload) VALUES($1,$2,'remote_support.input','device',$3,$4::jsonb)",[s.company_id,user.id,s.device_id,JSON.stringify({sessionId:s.id,inputId:inputRow.id,type:input.type})]);await c.query('COMMIT');return send(202,{id:inputRow.id,state:'queued'});
     }else if(action==='ack'&&!adminPath){
      if(!supportUuid.test(b.inputId||'')||!['completed','failed'].includes(b.state)){await c.query('ROLLBACK');return send(400,{error:'Ungültige Rückmeldung.'})}
      const result=await c.query("UPDATE remote_support_inputs SET state=$3,error=$4,input=input-'text',acknowledged_at=now() WHERE id=$1 AND session_id=$2 AND state='delivered' RETURNING id",[b.inputId,s.id,b.state,b.state==='failed'?'Aktion vom Kassenclient nicht ausgeführt':null]);if(!result.rowCount){await c.query('ROLLBACK');return send(409,{error:'Aktion bereits abgeschlossen oder nicht zugestellt.'})}
      await c.query("INSERT INTO audit_log(company_id,actor_user_id,event_type,entity_type,entity_id,payload) VALUES($1,$2,'remote_support.ack','device',$3,$4::jsonb)",[s.company_id,user.id,s.device_id,JSON.stringify({sessionId:s.id,inputId:b.inputId,state:b.state})]);await c.query('COMMIT');return send(200,{ok:true});
     }else{await c.query('ROLLBACK');return send(404,{error:'Aktion nicht erlaubt.'})}
    }
    await c.query("INSERT INTO audit_log(company_id,actor_user_id,event_type,entity_type,entity_id,payload) VALUES($1,$2,$3,'device',$4,$5::jsonb)",[s.company_id,user.id,'remote_support.'+action,s.device_id,JSON.stringify({sessionId:s.id,...(action==='accept'?{allowed:b.allowed,controlAllowed:b.allowed&&b.controlAllowed}:{})})]);await c.query('COMMIT');return send(200,{ok:true});
   }catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}
  }catch(e){return send(e.status||503,{error:e.status?e.message:'Fernhilfe momentan nicht verfügbar.'})}
 };
}
export async function migrateRemoteSupport(pool){await pool.query(`
 ALTER TABLE devices ADD COLUMN IF NOT EXISTS support_diagnostics jsonb;
 ALTER TABLE devices ADD COLUMN IF NOT EXISTS support_grant jsonb;
 CREATE TABLE IF NOT EXISTS remote_support_sessions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),device_id uuid NOT NULL REFERENCES devices(id),company_id uuid NOT NULL REFERENCES companies(id),created_by uuid NOT NULL REFERENCES users(id),created_session_hash text NOT NULL,accepted_by uuid REFERENCES users(id),accepted_session_hash text,state text NOT NULL DEFAULT 'requested' CHECK(state IN ('requested','active','declined','ended')),control_allowed boolean NOT NULL DEFAULT false,expires_at timestamptz NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),ended_at timestamptz,frame text,frame_sequence int NOT NULL DEFAULT 0,frame_at timestamptz,frame_width int,frame_height int);
 ALTER TABLE remote_support_sessions ADD COLUMN IF NOT EXISTS persistent_consent boolean NOT NULL DEFAULT false;
 CREATE UNIQUE INDEX IF NOT EXISTS remote_support_one_active_device ON remote_support_sessions(device_id) WHERE state IN ('requested','active');
 CREATE TABLE IF NOT EXISTS remote_support_inputs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),session_id uuid NOT NULL REFERENCES remote_support_sessions(id),created_by uuid NOT NULL REFERENCES users(id),input jsonb NOT NULL,state text NOT NULL DEFAULT 'queued',error text,created_at timestamptz NOT NULL DEFAULT now(),delivered_at timestamptz,acknowledged_at timestamptz);
 CREATE INDEX IF NOT EXISTS remote_support_inputs_queue ON remote_support_inputs(session_id,state,created_at);
 `)}

export async function cleanupRemoteSupport(pool){
 await pool.query(`UPDATE devices d SET support_grant=jsonb_set(d.support_grant,'{enabled}','false'::jsonb) WHERE d.support_grant->>'enabled'='true' AND NOT EXISTS(SELECT 1 FROM users grantor WHERE grantor.id=(d.support_grant->>'grantedBy')::uuid AND grantor.company_id=d.company_id AND grantor.status='active' AND grantor.role IN ('owner','admin'));`);
 await pool.query(`UPDATE remote_support_sessions rs SET state='ended',ended_at=now(),frame=NULL
 WHERE state IN ('requested','active') AND (
   expires_at<=now()
   OR NOT EXISTS(SELECT 1 FROM devices d WHERE d.id=rs.device_id AND d.company_id=rs.company_id AND d.status='active')
   OR NOT EXISTS(SELECT 1 FROM sessions auth JOIN users creator ON creator.id=auth.user_id
     JOIN platform_admins pa ON pa.user_id=creator.id AND pa.active
     WHERE auth.token_hash=rs.created_session_hash AND auth.expires_at>now() AND creator.status='active' AND NOT coalesce(creator.must_change_password,false))
   OR (rs.state='active' AND NOT (
     (rs.persistent_consent AND EXISTS(SELECT 1 FROM devices d JOIN users grantor ON grantor.id=(d.support_grant->>'grantedBy')::uuid
       WHERE d.id=rs.device_id AND d.support_grant->>'enabled'='true'
       AND (NOT rs.control_allowed OR d.support_grant->>'controlAllowed'='true')
       AND grantor.company_id=rs.company_id AND grantor.status='active' AND grantor.role IN ('owner','admin')))
     OR (NOT rs.persistent_consent AND EXISTS(SELECT 1 FROM sessions auth JOIN users accepted ON accepted.id=auth.user_id
       WHERE auth.token_hash=rs.accepted_session_hash AND auth.expires_at>now() AND accepted.status='active'
       AND accepted.role IN ('owner','admin') AND accepted.company_id=rs.company_id AND NOT coalesce(accepted.must_change_password,false)))
   ))
 )`);
 await pool.query(`UPDATE remote_support_inputs i SET state=CASE WHEN i.state='delivered' THEN 'uncertain' ELSE 'expired' END,input=i.input-'text' WHERE i.state IN ('queued','delivered') AND (i.created_at<=now()-interval '15 seconds' OR NOT EXISTS(SELECT 1 FROM remote_support_sessions s WHERE s.id=i.session_id AND s.state='active'))`);
}
