import crypto from "node:crypto";

export const TSE_ARCHITECTURE = "hardware_sd";

export async function ensureTseSchema(pool){
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tse_devices(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
      provider text,
      serial_number text,
      architecture text NOT NULL DEFAULT 'hardware_sd',
      connection_mode text NOT NULL DEFAULT 'local_bridge',
      status text NOT NULL DEFAULT 'not_configured',
      certified boolean NOT NULL DEFAULT false,
      metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(restaurant_id)
    );

    CREATE TABLE IF NOT EXISTS tse_transactions(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE RESTRICT,
      order_id uuid REFERENCES orders(id) ON DELETE RESTRICT,
      receipt_id uuid REFERENCES receipts(id) ON DELETE RESTRICT,
      client_transaction_id text NOT NULL UNIQUE,
      process_type text NOT NULL DEFAULT 'Kassenbeleg-V1',
      process_data jsonb NOT NULL,
      state text NOT NULL DEFAULT 'prepared',
      tse_transaction_number text,
      tse_serial_number text,
      signature_counter text,
      signature_algorithm text,
      log_time_format text,
      started_at timestamptz,
      finished_at timestamptz,
      signature text,
      public_key text,
      error_code text,
      error_message text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS tse_transactions_restaurant_created_idx
      ON tse_transactions(restaurant_id,created_at DESC);
    CREATE INDEX IF NOT EXISTS tse_transactions_order_idx
      ON tse_transactions(order_id);

    ALTER TABLE receipts ADD COLUMN IF NOT EXISTS tse_transaction_id uuid REFERENCES tse_transactions(id) ON DELETE SET NULL;
    ALTER TABLE receipts ADD COLUMN IF NOT EXISTS tse_snapshot jsonb;
  `);
}

export function groupVat(items=[]){
  const vat = new Map();
  for(const item of items){
    const quantity = Number(item.quantity ?? item.qty ?? 1);
    const unitPriceCents = Number(item.unit_price_cents ?? item.unitPriceCents ?? 0);
    const rate = Number(item.tax_rate_snapshot ?? item.taxRate ?? 0);
    const grossCents = Math.round(unitPriceCents * quantity);
    const netCents = Math.round(grossCents / (1 + rate / 100));
    const taxCents = grossCents - netCents;
    const current = vat.get(rate) || {rate,grossCents:0,netCents:0,taxCents:0};
    current.grossCents += grossCents;
    current.netCents += netCents;
    current.taxCents += taxCents;
    vat.set(rate,current);
  }
  return [...vat.values()].sort((a,b)=>a.rate-b.rate);
}

export function buildFiscalTransaction({restaurantId,order,items=[],payments=[],receipt}){
  if(!restaurantId) throw new Error("restaurantId fehlt");
  if(!order?.id) throw new Error("order.id fehlt");
  if(!receipt?.id && !receipt?.receipt_number && !receipt?.receiptNumber) throw new Error("Belegreferenz fehlt");

  const totalCents = Number(order.total_cents ?? order.totalCents ?? 0);
  const paymentTotal = payments.reduce((sum,p)=>sum + Number(p.amount_cents ?? p.amountCents ?? 0),0);
  const receiptNumber = receipt.receipt_number ?? receipt.receiptNumber;
  const clientTransactionId = `BN-TSE-${crypto.randomUUID()}`;

  return {
    clientTransactionId,
    processType:"Kassenbeleg-V1",
    restaurantId,
    orderId:order.id,
    receiptId:receipt.id ?? null,
    receiptNumber,
    startedAt:order.created_at ?? order.createdAt ?? new Date().toISOString(),
    closedAt:order.closed_at ?? order.closedAt ?? new Date().toISOString(),
    currency:"EUR",
    totalCents,
    paymentTotalCents:paymentTotal,
    totalsMatch:paymentTotal===totalCents,
    vat:groupVat(items),
    items:items.map(item=>({
      productId:item.product_id ?? item.productId ?? null,
      name:item.product_name_snapshot ?? item.name ?? "Artikel",
      quantity:Number(item.quantity ?? item.qty ?? 1),
      unitPriceCents:Number(item.unit_price_cents ?? item.unitPriceCents ?? 0),
      taxRate:Number(item.tax_rate_snapshot ?? item.taxRate ?? 0)
    })),
    payments:payments.map(payment=>({
      method:String(payment.method ?? "unknown"),
      amountCents:Number(payment.amount_cents ?? payment.amountCents ?? 0)
    }))
  };
}

export async function savePreparedTransaction(pool,payload){
  const q=await pool.query(`
    INSERT INTO tse_transactions(
      restaurant_id,order_id,receipt_id,client_transaction_id,process_type,process_data,state
    ) VALUES($1,$2,$3,$4,$5,$6::jsonb,'prepared')
    RETURNING id,client_transaction_id,state,created_at
  `,[
    payload.restaurantId,
    payload.orderId,
    payload.receiptId,
    payload.clientTransactionId,
    payload.processType,
    JSON.stringify(payload)
  ]);
  return q.rows[0];
}

export async function markTransactionStarted(pool,id,{tseTransactionNumber,startedAt=new Date().toISOString()}={}){
  const q=await pool.query(`
    UPDATE tse_transactions SET
      state='started',tse_transaction_number=COALESCE($2,tse_transaction_number),started_at=$3,updated_at=now()
    WHERE id=$1 RETURNING *
  `,[id,tseTransactionNumber ?? null,startedAt]);
  return q.rows[0] ?? null;
}

export async function markTransactionSigned(pool,id,result={}){
  const q=await pool.query(`
    UPDATE tse_transactions SET
      state='signed',
      tse_transaction_number=COALESCE($2,tse_transaction_number),
      tse_serial_number=$3,
      signature_counter=$4,
      signature_algorithm=$5,
      log_time_format=$6,
      finished_at=COALESCE($7,now()),
      signature=$8,
      public_key=$9,
      error_code=NULL,
      error_message=NULL,
      updated_at=now()
    WHERE id=$1 RETURNING *
  `,[
    id,
    result.transactionNumber ?? null,
    result.serialNumber ?? null,
    result.signatureCounter ?? null,
    result.signatureAlgorithm ?? null,
    result.logTimeFormat ?? null,
    result.finishedAt ?? null,
    result.signature ?? null,
    result.publicKey ?? null
  ]);
  return q.rows[0] ?? null;
}

export async function markTransactionFailed(pool,id,error={}){
  const q=await pool.query(`
    UPDATE tse_transactions SET
      state='failed',error_code=$2,error_message=$3,updated_at=now()
    WHERE id=$1 RETURNING *
  `,[id,String(error.code ?? "TSE_ERROR"),String(error.message ?? "TSE-Fehler")]);
  return q.rows[0] ?? null;
}

export function createUnconfiguredTseAdapter(){
  const unavailable=async()=>{
    const error=new Error("Keine zertifizierte TSE angeschlossen");
    error.code="TSE_NOT_CONFIGURED";
    throw error;
  };
  return {
    architecture:TSE_ARCHITECTURE,
    certified:false,
    status:async()=>({
      status:"not_configured",
      architecture:TSE_ARCHITECTURE,
      connection:"not_connected",
      certified:false,
      provider:null,
      serialNumber:null,
      requiresLocalBridge:true
    }),
    startTransaction:unavailable,
    finishTransaction:unavailable,
    cancelTransaction:unavailable
  };
}

export function receiptTseSnapshot(transaction){
  if(!transaction || transaction.state!=="signed") return null;
  return {
    transactionNumber:transaction.tse_transaction_number,
    serialNumber:transaction.tse_serial_number,
    signatureCounter:transaction.signature_counter,
    signatureAlgorithm:transaction.signature_algorithm,
    logTimeFormat:transaction.log_time_format,
    startedAt:transaction.started_at,
    finishedAt:transaction.finished_at,
    signature:transaction.signature,
    publicKey:transaction.public_key
  };
}
