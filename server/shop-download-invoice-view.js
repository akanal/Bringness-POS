import crypto from 'node:crypto';
import {readFileSync} from 'node:fs';
import {downloadInvoiceModel,downloadInvoiceDigest} from './shop-download-invoice.js';

// Embed the actual shared palette: the isolated printable document makes no
// external requests and does not carry a parallel status-colour definition.
const palette=readFileSync(new URL('../apps/web/public/shop/status-colors.css',import.meta.url),'utf8');
const css=palette+`
*{box-sizing:border-box}body{margin:0;background:#fff;color:#111;font:15px/1.5 system-ui,sans-serif}
main{max-width:860px;margin:auto;padding:24px;overflow-wrap:anywhere}h1{font-size:24px;margin:16px 0}
dl{margin:0}dt{font-weight:700}dd{margin:0 0 8px}.addresses{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin:24px 0}
address{font-style:normal}table{width:100%;border-collapse:collapse;table-layout:fixed}caption{text-align:left;font-weight:700;margin:12px 0}
th,td{text-align:left;padding:10px 4px;border-bottom:1px solid #ddd;vertical-align:top}th:last-child,td:last-child{text-align:right;width:130px}
.totals{margin:18px 0 18px auto;max-width:320px}.totals>div{display:flex;justify-content:space-between;gap:12px}.totals dd{text-align:right}
.total{font-weight:700;border-top:1px solid #111;padding-top:8px}.note{font-size:13px}footer{margin-top:24px;border-top:1px solid #ddd;padding-top:12px}
@media(max-width:480px){main{padding:12px}.addresses{grid-template-columns:1fr;gap:16px}h1{font-size:21px}th:last-child,td:last-child{width:105px}}
@page{size:A4;margin:15mm}@media print{main{padding:0;max-width:none}table,.totals,address{break-inside:avoid}thead{display:table-header-group}h1{font-size:20pt}.shop-status{display:block!important}footer{font-size:10pt}}
`;
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const euro=cents=>new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR'}).format(cents/100);
const date=value=>value.slice(8,10)+'.'+value.slice(5,7)+'.'+value.slice(0,4);
const address=(name,street,postalCode,city,country)=>`<address><strong>${escape(name)}</strong><br>${escape(street)}<br>${escape(postalCode)} ${escape(city)}<br>${escape(country)}</address>`;
export function renderShopDownloadInvoicePreview(snapshot){
 const m=downloadInvoiceModel(snapshot),p=m.product,b=m.buyer,s=m.seller;
 return `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex,nofollow"><meta name="referrer" content="no-referrer"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'sha256-${crypto.createHash('sha256').update(css).digest('base64')}'; base-uri 'none'; form-action 'none'"><title>Rechnungsvorschau ${escape(m.invoiceNumber)}</title><style>${css}</style></head><body><main>
 <p class="shop-status" data-tone="warning" role="status">Vorschau – keine ausgestellte Rechnung</p><h1>Rechnungsvorschau</h1>
 <dl><dt>Gespeicherte Rechnungsnummer</dt><dd>${escape(m.invoiceNumber)}</dd><dt>Rechnungsdatum</dt><dd>${date(m.invoiceDate)}</dd><dt>Leistungsdatum</dt><dd>${date(m.serviceDate)}</dd></dl>
 <div class="addresses"><section aria-label="Anbieter"><h2>Anbieter</h2>${address(s.name,s.street,s.postalCode,s.city,s.country)}<p>Steuernummer / USt-IdNr.: ${escape(s.taxId)}</p></section><section aria-label="Rechnungsempfänger"><h2>Rechnungsempfänger</h2>${address(b.company_name,b.street,b.postal_code,b.city,b.country)}</section></div>
 <table><caption>Einmalige Windows-Basislizenz</caption><thead><tr><th scope="col">Leistung</th><th scope="col">Netto</th></tr></thead><tbody><tr><td>${escape(m.description)}<br>Menge: 1 · einmalig</td><td>${euro(p.netCents)}</td></tr></tbody></table>
 <dl class="totals"><div><dt>Netto</dt><dd>${euro(p.netCents)}</dd></div><div><dt>Umsatzsteuer 19 %</dt><dd>${euro(p.vatCents)}</dd></div><div class="total"><dt>Gesamt</dt><dd>${euro(p.grossCents)}</dd></div></dl>
 <p class="note">Diese Vorschau zeigt die gespeicherten Rechnungsdaten. Sie bestätigt keine Rechnungszustellung und schaltet keine Lizenz frei. Keine erneute Zahlung erforderlich.</p>
 <footer>Vorschau – keine ausgestellte Rechnung. Keine Zahlungsaufforderung.</footer></main></body></html>`;
}
// Candidate response envelope for future protected routing. No route is mounted.
export function shopDownloadInvoicePreviewResponse(snapshot){
 const model=downloadInvoiceModel(snapshot),body=renderShopDownloadInvoicePreview(model);
 return {status:200,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'private, no-store','Pragma':'no-cache','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','X-Robots-Tag':'noindex, nofollow','Content-Security-Policy':`default-src 'none'; style-src 'sha256-${crypto.createHash('sha256').update(css).digest('base64')}'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`},digest:downloadInvoiceDigest(model),body};
}
