// Keep consumption analytics separate from the audit time of an import.
// Sales imports write legacy stock moves as well as sale effects; only the
// dedicated kitchen movement kinds are included in the second branch.
export async function migrateConsumptionHistory(db){
 await db.query(`CREATE OR REPLACE VIEW ai_consumption_events AS
  SELECT v.account_id,e.stock_id,v.event_type,e.delta,
   COALESCE(v.occurred_at,v.created_at) occurred_at,v.created_at recorded_at,
   'sales'::text source_kind,v.id::text source_id
  FROM ai_sale_events v JOIN ai_sale_effects e ON e.event_id=v.id
  JOIN ai_stock s ON s.id=e.stock_id AND s.account_id=v.account_id
  UNION ALL
  SELECT s.account_id,m.stock_id,
   CASE WHEN m.kind='recipe_consumption' THEN 'sale' ELSE 'reversal' END,
   m.delta,m.created_at,m.created_at,'kitchen'::text,m.id::text
  FROM ai_stock_moves m JOIN ai_stock s ON s.id=m.stock_id
  WHERE m.kind IN ('recipe_consumption','recipe_return')`);
}
