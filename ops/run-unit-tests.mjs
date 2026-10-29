import {readdir} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';

// Browser and database lifecycle suites have dedicated dependencies and CI jobs.
// Keep the default test command runnable after the documented root npm ci.
const root=fileURLToPath(new URL('../',import.meta.url));
const dedicated=new Set(['center-browser.test.js','center-database.test.js','pos-payment-browser.test.js']);
// PGlite-backed suites run in the isolated shop-payment CI job, which installs
// the test-only dependency without changing production npm dependencies.
const shopDatabaseTests=new Set(['shop-mollie-notification-service.test.js','shop-payment-ledger-pg.test.js','shop-payment-provider-sync.test.js','shop-payment-refund-sync.test.js','shop-document-number-pg.test.js','shop-document-record-pg.test.js','shop-document-issue-pg.test.js','shop-document-archive-pg.test.js','shop-document-archive-audit-pg.test.js','shop-document-archive-access-pg.test.js','shop-document-archive-integrity-pg.test.js','shop-document-archive-write-pg.test.js','shop-document-issue-archive-pg.test.js','shop-document-payment-guard-pg.test.js','shop-payment-invoice-flow.integration.test.js','shop-payment-invoice-success.integration.test.js']);
const files=[];
for(const directory of ['server','tests']){
 for(const name of (await readdir(new URL('../'+directory+'/',import.meta.url))).sort()){
  if(/\.test\.(js|mjs)$/.test(name)&&!dedicated.has(name)&&!shopDatabaseTests.has(name))files.push(directory+'/'+name);
 }
}
if(!files.length)throw Error('No unit tests found');
const child=spawn(process.execPath,['--test',...files],{cwd:root,stdio:'inherit',env:{...process.env,CENTER_TEST_PDFKIT:process.env.CENTER_TEST_PDFKIT||'pdfkit',CENTER_TEST_QRCODE:process.env.CENTER_TEST_QRCODE||'qrcode'}});
child.once('error',error=>{console.error(error);process.exitCode=1;});
child.once('exit',(code,signal)=>{process.exitCode=signal?1:(code??1);});
