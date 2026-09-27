import pg from "pg";
import { ensureTseSchema, createUnconfiguredTseAdapter } from "./tse-core.js";
import { createSwissbitTseAdapter } from "./tse-swissbit.js";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
});

export async function migrateTseIntegration(){
  await ensureTseSchema(pool);
  await pool.query(`
    CREATE OR REPLACE FUNCTION bringness_prepare_tse_transaction()
    RETURNS trigger AS $$
    DECLARE
      v_restaurant_id uuid;
      v_order_total int;
      v_order_created timestamptz;
      v_order_closed timestamptz;
      v_items jsonb;
      v_payments jsonb;
      v_vat jsonb;
      v_payment_total int;
      v_tx_id uuid;
      v_client_id text;
      v_process jsonb;
    BEGIN
      SELECT restaurant_id,total_cents,created_at,closed_at
        INTO v_restaurant_id,v_order_total,v_order_created,v_order_closed
      FROM orders WHERE id=NEW.order_id;

      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'productId',product_id,
        'name',product_name_snapshot,
        'quantity',quantity,
        'unitPriceCents',unit_price_cents,
        'taxRate',tax_rate_snapshot
      ) ORDER BY id),'[]'::jsonb)
      INTO v_items
      FROM order_items WHERE order_id=NEW.order_id;

      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'method',method,
        'amountCents',amount_cents
      ) ORDER BY created_at,id),'[]'::jsonb), COALESCE(SUM(amount_cents),0)::int
      INTO v_payments,v_payment_total
      FROM payments WHERE order_id=NEW.order_id;

      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'rate',rate,
        'grossCents',gross_cents,
        'netCents',net_cents,
        'taxCents',gross_cents-net_cents
      ) ORDER BY rate),'[]'::jsonb)
      INTO v_vat
      FROM (
        SELECT tax_rate_snapshot::numeric AS rate,
               SUM(ROUND(unit_price_cents * quantity))::int AS gross_cents,
               SUM(ROUND((unit_price_cents * quantity) / (1 + tax_rate_snapshot::numeric / 100)))::int AS net_cents
        FROM order_items
        WHERE order_id=NEW.order_id
        GROUP BY tax_rate_snapshot
      ) vat_groups;

      v_client_id := 'BN-TSE-' || gen_random_uuid()::text;
      v_process := jsonb_build_object(
        'clientTransactionId',v_client_id,
        'processType','Kassenbeleg-V1',
        'restaurantId',v_restaurant_id,
        'orderId',NEW.order_id,
        'receiptId',NEW.id,
        'receiptNumber',NEW.receipt_number,
        'startedAt',v_order_created,
        'closedAt',COALESCE(v_order_closed,now()),
        'currency','EUR',
        'totalCents',v_order_total,
        'paymentTotalCents',v_payment_total,
        'totalsMatch',(v_payment_total=v_order_total),
        'vat',v_vat,
        'items',v_items,
        'payments',v_payments
      );

      INSERT INTO tse_transactions(
        restaurant_id,order_id,receipt_id,client_transaction_id,process_type,process_data,state
      ) VALUES(
        v_restaurant_id,NEW.order_id,NEW.id,v_client_id,'Kassenbeleg-V1',v_process,'prepared'
      ) RETURNING id INTO v_tx_id;

      UPDATE receipts
      SET tse_transaction_id=v_tx_id,
          fiscal_status='prepared'
      WHERE id=NEW.id;

      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    DROP TRIGGER IF EXISTS receipts_prepare_tse_transaction ON receipts;
    CREATE TRIGGER receipts_prepare_tse_transaction
      AFTER INSERT ON receipts
      FOR EACH ROW
      EXECUTE FUNCTION bringness_prepare_tse_transaction();
  `);
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
      COUNT(*) FILTER (WHERE state='failed')::int failed_transactions
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
    dsfinvkExportAvailable:false,
    totalReceipts:r.total_receipts,
    signedReceipts:r.signed_receipts,
    unsignedReceipts:r.total_receipts-r.signed_receipts,
    totalTransactions:t.total_transactions,
    preparedTransactions:t.prepared_transactions,
    startedTransactions:t.started_transactions,
    signedTransactions:t.signed_transactions,
    failedTransactions:t.failed_transactions,
    message: status.provider==="swissbit"
      ? "Swissbit-Adapter ist eingebunden. Echte Signierung wird erst nach Konfiguration des offiziellen Swissbit SDK/Bridge und Hardwaretest aktiviert."
      : "TSE-Transaktionsdaten werden beim Beleg automatisch vorbereitet. Eine echte Signatur erfolgt erst nach Anschluss einer zertifizierten SD-/microSD-TSE."
  });
  return true;
}
