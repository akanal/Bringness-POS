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
