import {tseTriggerSql} from './tse-trigger-sql.js';
import {isolatedPreview} from './preview-policy.js';
import pg from "pg";
import {processPreparedTse} from "./tse-signing-worker.js";
import { ensureTseSchema, createUnconfiguredTseAdapter } from "./tse-core.js";
import { createSwissbitTseAdapter } from "./tse-swissbit.js";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
});

export async function migrateTseIntegration(db=pool){
  await ensureTseSchema(db);
  await db.query(tseTriggerSql);
}

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
  const crypto=await import("node:crypto");
  const tokenHash=crypto.createHash("sha256").update(token).digest("hex");
  const q=await pool.query(`
    SELECT u.id,u.company_id
    FROM sessions s JOIN users u ON u.id=s.user_id
    WHERE s.token_hash=$1 AND s.expires_at>now() AND u.status='active'
  `,[tokenHash]);
  return q.rows[0]||null;
}

async function adapterForRestaurant(restaurantId){
  const q=await pool.query(`
    SELECT provider,status,certified,serial_number
    FROM tse_devices WHERE restaurant_id=$1
  `,[restaurantId]);
  const device=q.rows[0]||null;
  const swissbitConfigured=Boolean(process.env.SWISSBIT_TSE_BRIDGE_COMMAND);
  if(device?.provider==="swissbit" || swissbitConfigured) return createSwissbitTseAdapter();
  return createUnconfiguredTseAdapter();
}

export async function handleTseRoutes(req,res){
  const url=new URL(req.url,"http://localhost");
  if(url.pathname!=="/api/v1/fiscal/status" || req.method!=="GET") return false;

  const user=await currentUser(req);
  if(!user){ sendJson(res,401,{error:"Nicht angemeldet"}); return true; }
  const restaurantId=url.searchParams.get("restaurantId");
  if(!restaurantId){ sendJson(res,400,{error:"Betrieb erforderlich"}); return true; }

  const allowed=await pool.query("SELECT 1 FROM restaurants WHERE id=$1 AND company_id=$2",[restaurantId,user.company_id]);
  if(!allowed.rowCount){ sendJson(res,404,{error:"Betrieb nicht gefunden"}); return true; }

  const tx=await pool.query(`
    SELECT
      COUNT(*)::int total_transactions,
      COUNT(*) FILTER (WHERE state='prepared')::int prepared_transactions,
      COUNT(*) FILTER (WHERE state='started')::int started_transactions,
      COUNT(*) FILTER (WHERE state='signed')::int signed_transactions,
      COUNT(*) FILTER (WHERE state='failed')::int failed_transactions,
      COUNT(*) FILTER (WHERE state='needs_review')::int review_transactions,
      COUNT(*) FILTER (WHERE state='starting')::int starting_transactions,
      COUNT(*) FILTER (WHERE state='finishing')::int finishing_transactions
    FROM tse_transactions WHERE restaurant_id=$1
  `,[restaurantId]);
  const receipts=await pool.query(`
    SELECT COUNT(*)::int total_receipts,
           COUNT(*) FILTER (WHERE fiscal_status='signed')::int signed_receipts
    FROM receipts rc JOIN orders o ON o.id=rc.order_id
    WHERE o.restaurant_id=$1
  `,[restaurantId]);
  const adapter=await adapterForRestaurant(restaurantId);
  const status=await adapter.status();
  const t=tx.rows[0],r=receipts.rows[0];

  sendJson(res,200,{
    ...status,
    integration:"prepared_transaction_flow",
    salesSigningActive:false,
    dsfinvkExportAvailable:false,
    totalReceipts:r.total_receipts,
    signedReceipts:r.signed_receipts,
    unsignedReceipts:r.total_receipts-r.signed_receipts,
    totalTransactions:t.total_transactions,
    preparedTransactions:t.prepared_transactions,
    startedTransactions:t.started_transactions,
    signedTransactions:t.signed_transactions,
    failedTransactions:t.failed_transactions,
    reviewTransactions:t.review_transactions,
    startingTransactions:t.starting_transactions,
    finishingTransactions:t.finishing_transactions,
    requiresManualReview:t.review_transactions>0,
    message: status.provider==="swissbit"
      ? "Swissbit-Adapter ist eingebunden. Echte Signierung wird erst nach Konfiguration des offiziellen Swissbit SDK/Bridge und Hardwaretest aktiviert."
      : "TSE-Transaktionsdaten werden beim Beleg automatisch vorbereitet. Eine echte Signatur erfolgt erst nach Anschluss einer zertifizierten SD-/microSD-TSE."
  });
  return true;
}

let signingBusy=false;
export async function tseSigningTick(){
 if(process.env.TSE_AUTOSIGN_ENABLED!=='true'||signingBusy)return;
 signingBusy=true;try{await processPreparedTse(pool,adapterForRestaurant);}finally{signingBusy=false;}
}
const signingTimer=setInterval(()=>{if(!isolatedPreview())return tseSigningTick().catch(()=>console.error('TSE signing worker failed'))},10000);signingTimer.unref();
