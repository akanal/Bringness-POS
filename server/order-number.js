// Public display labels never replace order UUIDs or guest capabilities.
export function orderNumber(order) {
  const value=String(order.pickup_number??'');
  return /^[1-9][0-9]*$/.test(value)?value.padStart(3,'0'):String(order.id||order.order_id||'').slice(0,8).toUpperCase();
}
export async function migrateOrderNumbers(pool) {
  await pool.query(`
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS pickup_number bigint CHECK(pickup_number>0);
    CREATE TABLE IF NOT EXISTS restaurant_order_counters(
      restaurant_id uuid PRIMARY KEY REFERENCES restaurants(id) ON DELETE CASCADE,
      last_number bigint NOT NULL CHECK(last_number>0));
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS pickup_number_period bigint NOT NULL DEFAULT 0;
    ALTER TABLE restaurant_order_counters ADD COLUMN IF NOT EXISTS number_period bigint NOT NULL DEFAULT 0;
    ALTER TABLE restaurant_order_counters ADD COLUMN IF NOT EXISTS last_reset_day date;
    CREATE TABLE IF NOT EXISTS restaurant_order_number_resets(
      restaurant_id uuid PRIMARY KEY REFERENCES restaurants(id) ON DELETE CASCADE,
      completed_day date NOT NULL);
    DROP INDEX IF EXISTS orders_restaurant_pickup_number;
    CREATE UNIQUE INDEX IF NOT EXISTS orders_restaurant_pickup_period_number ON orders(restaurant_id,pickup_number_period,pickup_number) WHERE pickup_number IS NOT NULL;
    CREATE OR REPLACE FUNCTION assign_order_pickup_number() RETURNS trigger LANGUAGE plpgsql AS $$
    DECLARE counter restaurant_order_counters%ROWTYPE; completed_day date;
    BEGIN
      INSERT INTO restaurant_order_counters(restaurant_id,last_number) VALUES(NEW.restaurant_id,1)
      ON CONFLICT(restaurant_id) DO UPDATE SET last_number=restaurant_order_counters.last_number+1
      RETURNING * INTO counter;
      SELECT r.completed_day INTO completed_day FROM restaurant_order_number_resets r WHERE r.restaurant_id=NEW.restaurant_id;
      IF completed_day IS NOT NULL AND (counter.last_reset_day IS NULL OR completed_day>counter.last_reset_day) AND NOT EXISTS (
        SELECT 1 FROM orders o WHERE o.restaurant_id=NEW.restaurant_id
          AND o.pickup_number IS NOT NULL
          AND o.status NOT IN ('cancelled','served')
          AND (to_jsonb(o)->>'pickup_collected_at') IS NULL
          AND o.created_at>now()-interval '24 hours'
      ) THEN
        UPDATE restaurant_order_counters SET last_number=1,number_period=number_period+1,last_reset_day=completed_day
          WHERE restaurant_id=NEW.restaurant_id RETURNING * INTO counter;
      END IF;
      NEW.pickup_number:=counter.last_number;
      NEW.pickup_number_period:=counter.number_period;
      RETURN NEW;
    END; $$;
    DROP TRIGGER IF EXISTS orders_assign_pickup_number ON orders;
    CREATE TRIGGER orders_assign_pickup_number BEFORE INSERT ON orders FOR EACH ROW EXECUTE FUNCTION assign_order_pickup_number();
  `);
}

// A cash closing marks the business day complete, including after midnight.
// Repeated shift closings on that same day cannot request another reset.
export async function requestOrderNumberReset(db,restaurantId,openedAt) {
  if(!(await db.query("SELECT to_regclass('restaurant_order_counters') present")).rows[0]?.present)return;
  await db.query(`INSERT INTO restaurant_order_number_resets(restaurant_id,completed_day)
    VALUES($1,($2::timestamptz AT TIME ZONE 'Europe/Berlin')::date)
    ON CONFLICT(restaurant_id) DO UPDATE SET completed_day=greatest(restaurant_order_number_resets.completed_day,excluded.completed_day)`,[restaurantId,openedAt]);
}
