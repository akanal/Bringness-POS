import {createQrGuestPush,migrateQrGuestPush} from './qr-guest-push.js';
import pg from "pg";
import {createQrService} from "./qr-service-core.js";
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.NODE_ENV==="production"?{rejectUnauthorized:false}:false});
const service=createQrService(pool),guestPush=createQrGuestPush(pool);
export const handleQrService=async(req,res)=>await guestPush.handle(req,res)||await service(req,res);
const guestPushTimer=setInterval(()=>guestPush.tick().catch(()=>console.error('QR guest push worker unavailable')),5000);guestPushTimer.unref();
export async function migrateQrService(){
  await pool.query(`
    ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS qr_service_mode text NOT NULL DEFAULT 'restaurant' CHECK(qr_service_mode IN ('restaurant','pickup'));
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS qr_service_mode text NOT NULL DEFAULT 'restaurant' CHECK(qr_service_mode IN ('restaurant','pickup'));
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS qr_ready_at timestamptz;
    CREATE INDEX IF NOT EXISTS orders_qr_queue_idx ON orders(restaurant_id,created_at,id) WHERE source='qr';
  `);
  await migrateQrGuestPush(pool);
}
