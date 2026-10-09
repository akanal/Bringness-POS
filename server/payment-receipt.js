import pg from "pg";
import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import { receiptUrl } from "./public-receipt.js";
import {createPaymentReceiptHandler} from "./payment-receipt-core.js";

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
});

export const handlePaymentReceipt=createPaymentReceiptHandler(pool,PDFDocument,QRCode,receiptUrl);

export async function renderMailReceipt(receiptId){
 const {renderPaymentReceipt}=await import('./payment-receipt-core.js');
 const q=await pool.query(`SELECT rc.receipt_number,rc.issued_at,rc.public_token,rc.fiscal_status,rc.merchant_snapshot,o.id order_id,o.total_cents,r.name restaurant_name,c.name company_name,b.company_name billing_name,b.street,b.postal_code,b.city,b.vat_id FROM receipts rc JOIN orders o ON o.id=rc.order_id JOIN restaurants r ON r.id=o.restaurant_id JOIN companies c ON c.id=r.company_id LEFT JOIN company_billing_profiles b ON b.company_id=c.id WHERE rc.id=$1`,[receiptId]);
 if(!q.rows[0])throw Error('RECEIPT_NOT_FOUND');
 const origin=new URL(process.env.PUBLIC_BASE_URL||'https://bringness.de');if(origin.protocol!=='https:')throw Error('PUBLIC_ORIGIN_INVALID');
 const pdf=await renderPaymentReceipt(pool,PDFDocument,QRCode,(_req,token)=>origin.origin+'/beleg/'+token,{headers:{host:origin.host}},q.rows[0]);
 return {pdf,restaurantName:q.rows[0].restaurant_name,filename:'Beleg-'+q.rows[0].receipt_number+'.pdf'};
}
