import {createRequire} from 'node:module';
import {dependency} from './dependency.mjs';
import {renderShopDownloadInvoicePreviewPdf} from '../../server/shop-download-invoice-pdf.js';
const require=createRequire(import.meta.url),PDFDocument=require(dependency('pdfkit','SHOP_PDFKIT_PATH'));
export const pdfRenderer=(snapshot,options={})=>renderShopDownloadInvoicePreviewPdf(snapshot,{...options,PDFDocument,qrEncoder:require('qrcode')});
