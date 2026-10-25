// Synthetic private QA outputs only, never invoices or release artefacts.
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {invoiceSample} from './download-invoice-fixture.mjs';
import {pdfRenderer} from './download-pdf-fixture.mjs';
const dir=process.env.SHOP_PDF_QA_DIR;if(!dir||!path.isAbsolute(dir))throw Error('Absolute SHOP_PDF_QA_DIR required');await mkdir(dir,{recursive:true});
const normal=invoiceSample();normal.buyer.company_name='Şahin & Müller - SYNTHETISCHES MUSTER';normal.seller.name='SYNTHETISCHER ANBIETER - KEINE ECHTE FIRMA';
const long=invoiceSample();for(const key of ['name','street','postalCode','city','taxId'])long.seller[key]=('SYNTHETISCHES MUSTER '+key+' ').repeat(30).slice(0,500);for(const key of ['company_name','street','postal_code','city'])long.buyer[key]=key==='street'?'W'.repeat(500):('MUSTER '+key+' ').repeat(50).slice(0,500);
for(const [name,snapshot]of [['normal-preview.pdf',normal],['long-preview.pdf',long]])await writeFile(path.join(dir,name),await pdfRenderer(snapshot));
console.log('Two synthetic PDF previews generated for private text/render acceptance.');
