import crypto from "node:crypto";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const validMode = value => ["restaurant", "pickup"].includes(value);
export function queueOrder(orders) {
  return [...orders].sort((a,b) => new Date(a.created_at)-new Date(b.created_at) || String(a.id).localeCompare(String(b.id)));
}
const send=(res,status,data)=>{res.writeHead(status,{"content-type":"application/json; charset=utf-8","cache-control":"no-store"});res.end(JSON.stringify(data));return true};
async function body(req) {
  let text="";
  for await(const chunk of req){text+=chunk;if(Buffer.byteLength(text)>4096)throw new Error("BODY_LIMIT")}
  return text?JSON.parse(text):{};
}
export function createQrService(pool) {
  async function actor(req) {
    const raw=String(req.headers.authorization||"").replace(/^Bearer\s+/i,"");
    if(!raw)return null;
    return (await pool.query("SELECT u.id,u.company_id,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now() AND u.status='active' AND coalesce(u.must_change_password,false)=false",[crypto.createHash("sha256").update(raw).digest("hex")])).rows[0]||null;
  }
  async function allowed(c,u,rid,tableId=null) {
    if(["owner","admin","manager","kitchen"].includes(u.role))return true;
    if(u.role!=="waiter")return false;
    const q=await c.query("SELECT 1 FROM employees e JOIN dining_tables t ON t.waiter_employee_id=e.id WHERE e.user_id=$1 AND e.restaurant_id=$2 AND e.active=true AND ($3::uuid IS NULL OR t.id=$3) LIMIT 1",[u.id,rid,tableId]);
    return !!q.rowCount;
  }
  return async function handleQrService(req,res) {
    const url=new URL(req.url,"http://local"),p=url.pathname;
    if(p==="/api/v1/guest/collection"&&req.method==="GET") {
      const id=url.searchParams.get("orderId"),key=url.searchParams.get("requestId");
      if(!uuid.test(id||"")||!uuid.test(key||""))return send(res,404,{error:"Bestellung nicht gefunden"});
      const q=await pool.query("SELECT o.id,o.qr_service_mode,o.qr_ready_at,o.status FROM orders o WHERE o.id=$1 AND o.guest_request_id=$2 AND o.source='qr'",[id,key]);
      if(!q.rowCount)return send(res,404,{error:"Bestellung nicht gefunden"});
      const o=q.rows[0];
      return send(res,200,{orderId:o.id,number:o.id.slice(0,8).toUpperCase(),mode:o.qr_service_mode,ready:!!o.qr_ready_at&&o.status!=="cancelled",closed:["paid","cancelled"].includes(o.status)});
    }
    if(p==="/api/v1/guest/service-mode"&&req.method==="GET") {
      const code=url.searchParams.get("code")||"";
      if(!/^[a-f0-9]{48}$/.test(code))return send(res,404,{error:"QR-Code ungültig"});
      const q=await pool.query("SELECT r.qr_service_mode FROM dining_tables t JOIN restaurants r ON r.id=t.restaurant_id WHERE t.qr_token=$1",[code]);
      return q.rowCount?send(res,200,{mode:q.rows[0].qr_service_mode}):send(res,404,{error:"QR-Code ungültig"});
    }
    const setting=p.match(/^\/api\/v1\/restaurants\/([0-9a-f-]{36})\/qr-service$/i);
    const ready=p.match(/^\/api\/v1\/orders\/([0-9a-f-]{36})\/collection-ready$/i);
    const queue=p==="/api/v1/qr-service/queue"&&req.method==="GET";
    if(!setting&&!ready&&!queue)return false;
    if(setting&&!["GET","PUT"].includes(req.method)||ready&&req.method!=="POST")return send(res,405,{error:"Methode nicht erlaubt"});
    if((setting&&!uuid.test(setting[1]))||(ready&&!uuid.test(ready[1])))return send(res,404,{error:"Nicht gefunden"});
    const u=await actor(req);if(!u)return send(res,401,{error:"Nicht angemeldet"});
    if(setting) {
      if(!["owner","admin"].includes(u.role))return send(res,403,{error:"Nur der Besitzer kann das Bestellmodell wählen"});
      if(req.method==="GET") {
        const q=await pool.query("SELECT qr_service_mode FROM restaurants WHERE id=$1 AND company_id=$2",[setting[1],u.company_id]);
        return q.rowCount?send(res,200,{mode:q.rows[0].qr_service_mode}):send(res,404,{error:"Betrieb nicht gefunden"});
      }
      let b;try{b=await body(req)}catch{return send(res,400,{error:"Ungültige Eingabe"})}
      if(!validMode(b.mode))return send(res,400,{error:"Bitte Restaurant- oder Tresenbetrieb wählen"});
      const c=await pool.connect();
      try{
        await c.query("BEGIN");
        const r=await c.query("SELECT qr_service_mode FROM restaurants WHERE id=$1 AND company_id=$2 FOR UPDATE",[setting[1],u.company_id]);
        if(!r.rowCount){await c.query("ROLLBACK");return send(res,404,{error:"Betrieb nicht gefunden"})}
        if(r.rows[0].qr_service_mode!==b.mode) {
          const open=await c.query("SELECT 1 FROM orders WHERE restaurant_id=$1 AND source='qr' AND status<>'cancelled' AND (status<>'paid' OR (qr_service_mode='pickup' AND qr_ready_at IS NULL)) LIMIT 1",[setting[1]]);
          if(open.rowCount){await c.query("ROLLBACK");return send(res,409,{error:"Offene QR-Bestellungen zuerst abschließen"})}
          await c.query("UPDATE restaurants SET qr_service_mode=$2 WHERE id=$1",[setting[1],b.mode]);
        }
        await c.query("COMMIT");return send(res,200,{mode:b.mode});
      }catch(e){await c.query("ROLLBACK");throw e}finally{c.release()}
    }
    if(ready) {
      const c=await pool.connect();
      try{
        await c.query("BEGIN");
        const q=await c.query("SELECT o.id,o.restaurant_id,o.table_id,o.status,o.qr_service_mode FROM orders o JOIN restaurants r ON r.id=o.restaurant_id WHERE o.id=$1 AND r.company_id=$2 AND o.source='qr' FOR UPDATE OF o",[ready[1],u.company_id]);
        if(!q.rowCount){await c.query("ROLLBACK");return send(res,404,{error:"Bestellung nicht gefunden"})}
        const o=q.rows[0];
        if(!await allowed(c,u,o.restaurant_id,o.table_id)){await c.query("ROLLBACK");return send(res,403,{error:"Kein Zugriff auf diese Bestellung"})}
        if(o.qr_service_mode!=="pickup"||o.status==="cancelled"){await c.query("ROLLBACK");return send(res,409,{error:"Keine abholbare Tresenbestellung"})}
        await c.query("UPDATE orders SET qr_ready_at=coalesce(qr_ready_at,now()) WHERE id=$1",[o.id]);
        await c.query("COMMIT");return send(res,200,{ok:true});
      }catch(e){await c.query("ROLLBACK");throw e}finally{c.release()}
    }
    const rid=url.searchParams.get("restaurantId");
    if(!uuid.test(rid||""))return send(res,400,{error:"Betrieb ungültig"});
    const r=await pool.query("SELECT qr_service_mode FROM restaurants WHERE id=$1 AND company_id=$2",[rid,u.company_id]);
    if(!r.rowCount||!await allowed(pool,u,rid))return send(res,403,{error:"Kein Zugriff auf diesen Betrieb"});
    const q=await pool.query(`SELECT o.id,o.source,o.status,o.table_id,t.name table_name,t.area table_area,o.created_at,o.total_cents,o.qr_service_mode,o.qr_ready_at,
      (SELECT coalesce(json_agg(json_build_object('name',i.product_name_snapshot,'quantity',i.quantity,'note',i.guest_note,'extras',i.extras_snapshot) ORDER BY i.id),'[]'::json) FROM order_items i WHERE i.order_id=o.id) items
      FROM orders o JOIN dining_tables t ON t.id=o.table_id
      WHERE o.restaurant_id=$1 AND o.source='qr' AND o.status<>'cancelled'
      AND (o.status<>'paid' OR (o.qr_service_mode='pickup' AND o.qr_ready_at IS NULL))
      AND ($2::text<>'waiter' OR EXISTS(SELECT 1 FROM employees e WHERE e.id=t.waiter_employee_id AND e.user_id=$3 AND e.active=true))
      ORDER BY o.created_at,o.id`,[rid,u.role,u.id]);
    return send(res,200,{mode:r.rows[0].qr_service_mode,orders:queueOrder(q.rows)});
  };
}
