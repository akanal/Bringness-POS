const discountSql="COALESCE((SELECT (a->>'discountCents')::int FROM jsonb_array_elements(COALESCE(NEW.sale_adjustment->'allocations','[]'::jsonb)) a WHERE a->>'productId'=order_items.product_id::text),0)";
export const tseTriggerSql=`
    ALTER TABLE receipts ADD COLUMN IF NOT EXISTS sale_adjustment jsonb;
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
        'discountCents',${discountSql},
        'lineTotalCents',ROUND(unit_price_cents * quantity)-${discountSql},
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
               SUM(ROUND(unit_price_cents * quantity)-${discountSql})::int AS gross_cents,
               SUM(ROUND((ROUND(unit_price_cents * quantity)-${discountSql}) / (1 + tax_rate_snapshot::numeric / 100)))::int AS net_cents
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
  `;
