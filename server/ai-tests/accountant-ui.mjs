import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
const script=await readFile(new URL('../../apps/web/public/accountant.js',import.meta.url),'utf8'),html=await readFile(new URL('../../apps/web/public/accountant.html',import.meta.url),'utf8');
const rid='11111111-1111-4111-8111-111111111111',asOf='2026-10-17T06:00:00.123456Z';
const receipts=[{id:'22222222-2222-4222-8222-222222222222',receipt_number:' \t=HYPERLINK("unsafe")',issued_at:asOf,total_cents:250,payments:[{method:' @formula',amountCents:250}],fiscal_status:'pending',source:'offline'}];
const wait=async predicate=>{for(let i=0;i<200;i++){if(predicate())return;await new Promise(resolve=>setTimeout(resolve,5));}throw Error('Accountant UI timed out');};
async function accountant(pages){
 const w=new JSDOM(html,{url:'https://bringness.de/accountant.html#private-link-fixture',runScripts:'outside-only'}).window,downloads=[];
 w.Blob=Blob;w.URL.createObjectURL=blob=>{downloads.push(blob);return 'blob:fixture';};w.URL.revokeObjectURL=()=>{};w.HTMLAnchorElement.prototype.click=function(){};
 let at=0;w.fetch=async(url,options)=>{assert(!url.includes('private-link-fixture'));assert.equal(options.headers.authorization,'Bearer private-link-fixture');const data=pages[Math.min(at++,pages.length-1)];return {ok:true,json:async()=>data};};w.eval(script);return {w,downloads};
}
const {w,downloads}=await accountant([{restaurantId:rid,from:'2026-01-01',to:'2026-12-31',asOf,receipts,nextCursor:null}]);
try{
 await wait(()=>!w.document.getElementById('csv').disabled);assert.equal(w.location.hash,'');w.document.getElementById('csv').click();const csv=await downloads[0].text();assert(csv.includes('"\' \t=HYPERLINK'));assert(csv.includes('"\' @formula'));assert(csv.includes('""unsafe""'));
 w.document.getElementById('json').click();const json=JSON.parse(await downloads[1].text());assert.equal(json.officialDsfinvk,false);assert.equal(json.receipts.length,1);assert(!JSON.stringify(json).includes('private-link-fixture'));
}finally{w.close();}
const ownerScript=await readFile(new URL('../../apps/web/public/pos/tax-export.js',import.meta.url),'utf8');
const owner=new JSDOM('<select id="restaurant"><option value="'+rid+'">Betrieb</option></select><div class="modulepage">Belege</div>',{url:'https://bringness.de/pos/',runScripts:'outside-only'}).window,ownerDownloads=[];
try{
 owner.localStorage.setItem('bringness-pos-token','owner-fixture');owner.Blob=Blob;owner.URL.createObjectURL=blob=>{ownerDownloads.push(blob);return 'blob:fixture';};owner.URL.revokeObjectURL=()=>{};owner.HTMLAnchorElement.prototype.click=function(){};owner.alert=message=>{throw Error(message);};
 owner.fetch=async url=>{const u=new URL(url,'https://bringness.de');const data=u.pathname.endsWith('/grants')?{grants:[]}:u.pathname.includes('/fiscal/')?{certified:false,unsignedReceipts:1}: {restaurantId:rid,from:u.searchParams.get('from'),to:u.searchParams.get('to'),asOf,receipts,nextCursor:null};return {ok:true,json:async()=>data};};
 owner.eval(ownerScript);await wait(()=>owner.document.getElementById('taxExportStatus')?.textContent.includes('Belege'));await owner.document.getElementById('taxReceiptCsv').onclick();assert((await ownerDownloads[0].text()).includes('"\' \t=HYPERLINK'));
}finally{owner.close();}
console.log('Accountant and owner CSV UI passed: leading whitespace/control formula escaping, quote preservation, private bearer fragment removal and internal-format JSON.');
