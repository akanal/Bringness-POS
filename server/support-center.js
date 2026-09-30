import crypto from 'node:crypto';
import pg from 'pg';
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.NODE_ENV==='production'?{rejectUnauthorized:false}:false});
import {topics,supportAnswer,mayRead} from './support-policy.js';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const send=(res,status,data)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(data));return true};
async function body(req){let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>10000)throw Error('Anfrage zu groß')}return JSON.parse(raw||'{}')}
export async function migrateSupport(){await pool.query(`CREATE TABLE IF NOT EXISTS support_conversations(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid NOT NULL REFERENCES companies(id),user_id uuid NOT NULL REFERENCES users(id),subject text NOT NULL,status text NOT NULL DEFAULT 'open',created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now());CREATE TABLE IF NOT EXISTS support_messages(id bigserial PRIMARY KEY,conversation_id uuid NOT NULL REFERENCES support_conversations(id) ON DELETE CASCADE,author_kind text NOT NULL,author_user_id uuid REFERENCES users(id),content text NOT NULL,topic_id text,created_at timestamptz NOT NULL DEFAULT now());CREATE INDEX IF NOT EXISTS support_company_idx ON support_conversations(company_id,updated_at DESC);CREATE INDEX IF NOT EXISTS support_messages_chat_idx ON support_messages(conversation_id,id);`)}
export async function handleSupport(req,res){
 const url=new URL(req.url,'http://local'),p=url.pathname;
 if(p==='/support/whatsapp'){res.writeHead(302,{location:'/pos/?support=open'});res.end();return true}
 if(!p.startsWith('/api/v1/support/')&&p!=='/api/v1/admin/support'&&!p.startsWith('/api/v1/admin/support/'))return false;
 const bearer=String(req.headers.authorization||'').replace(/^Bearer\s+/i,'');
 const actor=(await pool.query("SELECT u.id,u.company_id,u.role,u.must_change_password,EXISTS(SELECT 1 FROM platform_admins a WHERE a.user_id=u.id AND a.active=true) platform FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now() AND u.status='active'",[crypto.createHash('sha256').update(bearer).digest('hex')])).rows[0];
 if(!actor)return send(res,401,{error:'Bitte anmelden, damit dein Supportverlauf gespeichert werden kann.'});
 if(actor.must_change_password)return send(res,428,{error:'Bitte zuerst dein Erstpasswort ändern.'});
 const admin=p.startsWith('/api/v1/admin/support');if(admin&&!actor.platform)return send(res,403,{error:'Dieser Bereich ist nur für Plattformadministratoren freigegeben.'});
 if((p==='/api/v1/admin/support'||p==='/api/v1/support/conversations')&&req.method==='GET'){
  const status=url.searchParams.get('status')||'',q=(url.searchParams.get('q')||'').slice(0,150);
  const rows=await pool.query(`SELECT c.*,u.display_name,u.email,co.name company_name FROM support_conversations c JOIN users u ON u.id=c.user_id JOIN companies co ON co.id=c.company_id WHERE ($1::boolean OR c.company_id=$2 AND ($3::boolean OR c.user_id=$4)) AND ($5='' OR c.status=$5) AND ($6='' OR c.subject ILIKE '%'||$6||'%' OR co.name ILIKE '%'||$6||'%' OR u.email ILIKE '%'||$6||'%') ORDER BY c.updated_at DESC LIMIT 100`,[admin,actor.company_id,['owner','admin'].includes(actor.role),actor.id,status,q]);
  const counts=await pool.query(`SELECT c.status,count(*)::int count FROM support_conversations c WHERE ($1::boolean OR c.company_id=$2 AND ($3::boolean OR c.user_id=$4)) GROUP BY c.status`,[admin,actor.company_id,['owner','admin'].includes(actor.role),actor.id]);
  const frequent=await pool.query(`SELECT COALESCE(m.topic_id,'specific') topic,count(*)::int count FROM support_messages m JOIN support_conversations c ON c.id=m.conversation_id WHERE m.author_kind='auto' AND ($1::boolean OR c.company_id=$2 AND ($3::boolean OR c.user_id=$4)) GROUP BY m.topic_id ORDER BY count(*) DESC LIMIT 10`,[admin,actor.company_id,['owner','admin'].includes(actor.role),actor.id]);
  return send(res,200,{conversations:rows.rows,counts:counts.rows,frequent:frequent.rows,topics:topics.map(t=>({id:t.id,title:t.title})),limit:100});
 }
 if(p==='/api/v1/support/message'&&req.method==='POST'){
  const b=await body(req),question=String(b.question||'').trim();if(!question||question.length>2000)return send(res,400,{error:'Bitte eine Frage mit höchstens 2.000 Zeichen eingeben.'});
  if(b.conversationId&&!uuid.test(b.conversationId))return send(res,400,{error:'Ungültiger Verlauf'});
  const c=await pool.connect();try{await c.query('BEGIN');let chat;
   if(b.conversationId){chat=(await c.query('SELECT * FROM support_conversations WHERE id=$1 FOR UPDATE',[b.conversationId])).rows[0];if(!chat||!mayRead(actor,chat)){await c.query('ROLLBACK');return send(res,404,{error:'Verlauf nicht gefunden'})}}
   else chat=(await c.query('INSERT INTO support_conversations(company_id,user_id,subject) VALUES($1,$2,$3) RETURNING *',[actor.company_id,actor.id,question.slice(0,100)])).rows[0];
   const rate=await c.query("SELECT count(*)::int n FROM support_messages WHERE author_user_id=$1 AND author_kind='customer' AND created_at>now()-interval '1 minute'",[actor.id]);if(rate.rows[0].n>=20){await c.query('ROLLBACK');return send(res,429,{error:'Bitte einen Moment warten.'})}
   const answer=supportAnswer(question,actor.role),text=answer?.answer||'Dazu habe ich noch keine passende vorgefertigte Antwort. Deine Frage wurde an das Bringness-Supportteam weitergegeben. Eine Antwort findest du hier im Verlauf.';
   await c.query("INSERT INTO support_messages(conversation_id,author_kind,author_user_id,content) VALUES($1,'customer',$2,$3)",[chat.id,actor.id,question]);
   await c.query("INSERT INTO support_messages(conversation_id,author_kind,content,topic_id) VALUES($1,'auto',$2,$3)",[chat.id,text,answer?.id||null]);
   await c.query("UPDATE support_conversations SET updated_at=now(),status=CASE WHEN $2 THEN 'needs_admin' WHEN status='needs_admin' THEN status ELSE 'open' END WHERE id=$1",[chat.id,!answer]);await c.query('COMMIT');return send(res,200,{conversationId:chat.id,answer:text,topic:answer,escalated:!answer});
  }catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}
 }
 const match=p.match(/^\/api\/v1\/(?:support\/conversations|admin\/support)\/([0-9a-f-]+)(?:\/(reply|status|escalate))?$/i);
 if(!match||!uuid.test(match[1]))return send(res,404,{error:'Supportfunktion nicht gefunden'});
 const chat=(await pool.query('SELECT * FROM support_conversations WHERE id=$1',[match[1]])).rows[0];if(!chat||!mayRead(actor,chat))return send(res,404,{error:'Verlauf nicht gefunden'});
 if(!match[2]&&req.method==='GET'){const messages=await pool.query('SELECT id,author_kind,content,topic_id,created_at FROM support_messages WHERE conversation_id=$1 ORDER BY id',[chat.id]);return send(res,200,{conversation:chat,messages:messages.rows})}
 if(match[2]==='escalate'&&req.method==='POST'){await pool.query("UPDATE support_conversations SET status='needs_admin',updated_at=now() WHERE id=$1",[chat.id]);return send(res,200,{message:'Deine Anfrage wurde an das Supportteam weitergegeben.'})}
 if(admin&&match[2]==='reply'&&req.method==='POST'){const b=await body(req),text=String(b.message||'').trim();if(!text||text.length>5000)return send(res,400,{error:'Antwort mit 1 bis 5.000 Zeichen erforderlich'});await pool.query("WITH added AS (INSERT INTO support_messages(conversation_id,author_kind,author_user_id,content) VALUES($1,'admin',$2,$3)) UPDATE support_conversations SET status='answered',updated_at=now() WHERE id=$1",[chat.id,actor.id,text]);return send(res,200,{ok:true})}
 if(admin&&match[2]==='status'&&req.method==='POST'){const b=await body(req);if(!['open','needs_admin','answered','closed'].includes(b.status))return send(res,400,{error:'Ungültiger Status'});await pool.query('UPDATE support_conversations SET status=$2,updated_at=now() WHERE id=$1',[chat.id,b.status]);return send(res,200,{ok:true})}
 return send(res,405,{error:'Aktion nicht erlaubt'});
}
