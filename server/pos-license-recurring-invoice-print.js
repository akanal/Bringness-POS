// Generate a PDF-ready HTML document with A4 print layout.
// Browser print-to-PDF is possible; this is not a generated PDF binary.
import {renderSandboxInvoiceHtml} from "./pos-license-recurring-invoice-html.js";
export function renderSandboxInvoicePrintHtml(details){
 const html=renderSandboxInvoiceHtml(details);
 return html.replace("</style>","@page{size:A4;margin:18mm}@media print{body{margin:0;max-width:none;padding:0}footer{break-inside:avoid}}</style>");
}
