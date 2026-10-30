import {composeMarketplaceTestHost} from './shop-mollie-marketplace-host.js';
import {createMarketplaceTestIntegration} from './shop-mollie-marketplace-integration.js';
import {migrateMerchantCustomerNumbers} from './merchant-customer-numbers.js';
import {configuredIdriveDocumentStore} from './idrive-document-store.js';
import {createShopDocumentsRuntime} from './shop-documents-http.js';
import {createMarketplaceRuntime} from './shop-marketplace-http.js';
import {marketplaceEnabled} from './shop-marketplace-rollout.js';
import {createShopAssistant} from './shop-assistant.js';
import {createSellerRuntime} from './shop-seller-http.js';
import {createShopRegistrationRuntime} from './shop-registration-http.js';
import {createShopRuntime} from './shop-http.js';
import {createPosEan,migratePosEan} from './pos-ean.js';
import {clientInputError} from './http-body.js';
import {isolatedPreview,assertPreviewEntrypoint} from './preview-policy.js';
import {createTableSettlement,migrateTableSettlement} from './table-settlement.js';
import {migrateBillingMail,createBillingMail} from './billing-mail.js';
import {createDutyPlanning,migrateDutyPlanning} from './duty-planning.js';
import {createWaiterDelivery,migrateWaiterDelivery} from './waiter-push-delivery.js';
import {createSandboxWorker,migrateFiskalySandbox,sandboxStatus,requestFiskalySetup,onboardingRequest} from './fiskaly-sandbox.js';
import {createFiskalyTest,migrateFiskalyTest} from './fiskaly-test.js';
import {createPackageAccess} from './package-access.js';
import {createWaiterWorkflow,migrateWaiterWorkflow} from './waiter-workflow.js';
import {migrateTransactionalMail,createMailWorker,createMailStatus} from './transactional-mail.js';
import {renderMailReceipt} from './payment-receipt.js';
import {createSystemDirectory} from './system-access.js';
import {createDisplays,migrateDisplays} from './displays.js';
import {createPersonnel,migratePersonnel} from './personnel.js';
import {createRemoteSupport,migrateRemoteSupport,cleanupRemoteSupport} from './remote-support-core.js';
import {handlePlatformAiAssets} from './platform-ai-assets.js';
import {handleAccountantAccess,migrateAccountantAccess} from './accountant-access.js';
import {handleOfflineSales,migrateOfflineSales} from './offline-sales.js';
import {handlePosStockBridge,migratePosStockEvents} from './pos-stock-bridge.js';
import {handleLanguageCatalog,ensureLanguageDatabase} from "./language-catalog.js";
import fs from "node:fs";
import {handleCenter,migrateCenter} from "./center.js";
import {handleQrService,migrateQrService} from "./qr-service.js";
import {runtimeMode, configurePosOrigin, redirectLegacyPosDomain, loadAiFeatures, blockAiRequest} from "./runtime-mode.js";
import {serveMarketplaceHome} from './marketplace-home.js';
assertPreviewEntrypoint();
const appMode = runtimeMode();
configurePosOrigin(process.env, appMode);
const aiFeatures = await loadAiFeatures(appMode);
import { Readable } from "node:stream";
import http from "node:http";
import pg from "pg";
import { handleRestaurantOwnerFeature, migrateRestaurantOwnerFeatures } from "./restaurant-owner-features.js";
import { handlePaymentCheckout, migratePaymentCheckout } from "./payment-checkout.js";
import { handlePaymentReceipt } from "./payment-receipt.js";
import { handlePublicReceipt, migratePublicReceipts } from "./public-receipt.js";
import { handleTseRoutes, migrateTseIntegration } from "./tse-integration.js";
import { handleBillingAccess, migrateBillingAccess } from "./billing-access.js";
import { handleBillingStatus } from "./billing-status.js";
import { handleDeviceLicense, migrateDeviceLicense } from "./device-license.js";
import {createPlatformAiGateway} from "./platform-ai-gateway.js";
import { handlePlatformControl } from "./platform-control.js";
import { handleAdminPasswordReset, requireAdminPasswordChange } from "./admin-password-reset.js";
import { handleSupport, migrateSupport } from "./support-center.js";
import { handleAdminTeam } from "./admin-team.js";
import { handleStaffInvitations, migrateStaffInvitations } from "./staff-invitations.js";
import { handleAdminAuditExport } from "./admin-audit-export.js";
import { handleBillingTerms, migrateBillingTerms } from "./billing-terms.js";

// Protect the current 399 EUR download-license decision from obsolete legacy SQL.
const originalPoolQuery = pg.Pool.prototype.query;
pg.Pool.prototype.query = function patchedPoolQuery(text, ...args) {
  if (typeof text === "string" && text.includes("UPDATE billing_plans SET amount_cents=29900,currency='EUR' WHERE code='download_license' AND amount_cents=39900;")) {
    text = text.replace("UPDATE billing_plans SET amount_cents=29900,currency='EUR' WHERE code='download_license' AND amount_cents=39900;", "");
  }
  return originalPoolQuery.call(this, text, ...args);
};

const platformGatewayPool=new pg.Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.NODE_ENV==="production"?{rejectUnauthorized:false}:false});
let shopRegistrationRuntime={migrate:async()=>{},handle:async()=>false};
if(appMode!=='ai'&&process.env.SHOP_REGISTRATION_ENABLED!=='false'){
  try{shopRegistrationRuntime=createShopRegistrationRuntime(platformGatewayPool,{enabled:true,publicOrigin:"https://bringness.de"});}
  catch{console.error('Shop registration configuration unavailable; registration remains closed.');}
}
const shopRuntime=createShopRuntime(platformGatewayPool,{enabled:appMode!=='ai'&&process.env.SHOP_DRAFTS_ENABLED!=='false'});
let shopAssistant={migrate:async()=>{},handle:async()=>false};
try{shopAssistant=createShopAssistant(platformGatewayPool,{enabled:appMode!=='ai'&&process.env.SHOP_ASSISTANT_ENABLED!=='false',key:process.env.SHOP_ASSISTANT_API_KEY||process.env.OPENAI_API_KEY,model:process.env.SHOP_ASSISTANT_MODEL||process.env.OPENAI_MODEL,publicOrigin:process.env.SHOP_PUBLIC_ORIGIN||'https://bringness.de'});}catch{console.error('Shop assistant configuration unavailable; guided help remains available.');}
const sellerRuntime=createSellerRuntime(platformGatewayPool,{enabled:appMode!=='ai'&&process.env.SHOP_SELLER_DRAFTS_ENABLED!=='false'});
const marketHost=composeMarketplaceTestHost(platformGatewayPool,{env:process.env,appMode,isolated:isolatedPreview(),marketplaceEnabled:marketplaceEnabled(process.env,appMode),createIntegration:createMarketplaceTestIntegration});
const marketplaceRuntime=createMarketplaceRuntime(platformGatewayPool,{enabled:marketplaceEnabled(process.env,appMode),checkoutProviderResolver:marketHost.checkoutProviderResolver,merchantConnections:marketHost.merchantConnections,checkoutReadiness:marketHost.report});
let marketScheduler=null;

let documentStore=null;
if(appMode!=='ai'&&!isolatedPreview())try{documentStore=await configuredIdriveDocumentStore(process.env);}catch{console.error('Private document storage unavailable; document uploads remain closed.');}
const documentsRuntime=createShopDocumentsRuntime(platformGatewayPool,{enabled:appMode!=='ai'&&!isolatedPreview(),store:documentStore});
const handlePlatformAiGateway=createPlatformAiGateway(platformGatewayPool);
const handleRemoteSupport=createRemoteSupport(platformGatewayPool);
const handlePackageAccess=createPackageAccess(platformGatewayPool);
const handlePersonnel=createPersonnel(platformGatewayPool);
const handlePosEan=createPosEan(platformGatewayPool);
const handleDutyPlanning=createDutyPlanning(platformGatewayPool);
const handleTableSettlement=createTableSettlement(platformGatewayPool);
const handleWaiterWorkflow=createWaiterWorkflow(platformGatewayPool);
const handleDisplays=createDisplays(platformGatewayPool);
const handleMailStatus=createMailStatus(platformGatewayPool);
const handleSystemDirectory=createSystemDirectory(platformGatewayPool);
const handleFiskalyTest=createFiskalyTest(platformGatewayPool,{sandboxStatus:companyId=>sandboxStatus(platformGatewayPool,companyId),requestSetup:(companyId,credentials)=>requestFiskalySetup(platformGatewayPool,companyId,credentials)});

// Add modular API routes without destabilising the large legacy server file.
const originalCreateServer = http.createServer.bind(http);
http.createServer = function patchedCreateServer(listener) {
  return originalCreateServer(async (req,res) => {
    try {
      if (redirectLegacyPosDomain(req,res,appMode)) return;
      if (serveMarketplaceHome(req,res,appMode,()=>fs.readFileSync(new URL('../apps/web/public/shop/index.html',import.meta.url),'utf8'))) return;
      if(appMode!=='ai' && req.method==='GET' && new URL(req.url,'http://local').pathname==='/health/fiskaly-test'){
        const row=(await platformGatewayPool.query('SELECT state,phase,last_error FROM fiskaly_test_setup WHERE request_id=$1',[onboardingRequest.requestId])).rows[0];
        res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});
        return res.end(JSON.stringify({mode:'TEST',state:row?.state||'waiting',signatureConfirmed:row?.state==='complete',phase:row?.phase||null,errorCode:row?.last_error||null}));
      }
      if (appMode!=='ai' && await handleSystemDirectory(req,res)) return;
      if (appMode!=='ai' && await handlePackageAccess(req,res)) return;
      if (appMode!=='ai' && await handleWaiterWorkflow(req,res)) return;
      if (appMode!=='ai' && await handlePosEan(req,res)) return;
      if (appMode!=='ai' && await handleDutyPlanning(req,res)) return;
      if (appMode!=='ai' && await handlePersonnel(req,res)) return;
      if (appMode!=='ai' && await handleDisplays(req,res)) return;
      if (appMode!=='ai' && await handleMailStatus(req,res)) return;
      if (await handleLanguageCatalog(req,res)) return;
      if (await handlePlatformAiAssets(req,res)) return;
      if (blockAiRequest(req,res,appMode)) return;
      if (appMode==='pos' && ['GET','HEAD'].includes(req.method)) {
        const seoPath = new URL(req.url,'http://local').pathname;
        if (seoPath==='/robots.txt' || seoPath==='/sitemap.xml') {
          const contents=fs.readFileSync(new URL('../apps/web/public'+seoPath,import.meta.url));
          res.writeHead(200,{'content-type':seoPath.endsWith('.xml')?'application/xml; charset=utf-8':'text/plain; charset=utf-8','cache-control':'public, max-age=300','x-content-type-options':'nosniff'});
          return res.end(req.method==='HEAD'?undefined:contents);
        }
      }
      if (aiFeatures && await aiFeatures.handleAiPlatform(req,res)) return;
      if (await requireAdminPasswordChange(req,res)) return;
      if (await handlePosStockBridge(req,res)) return;
      if (await handleCenter(req,res)) return;
      if (await handleQrService(req,res)) return;
      if (await handleSupport(req,res)) return;
      if (await handleDeviceLicense(req,res)) return;
      if (await handleOfflineSales(req,res)) return;
      if (await handleAccountantAccess(req,res)) return;
      if (await handleAdminPasswordReset(req,res)) return;
      if (await handleAdminTeam(req,res)) return;
      if (await handleStaffInvitations(req,res)) return;
      if (await handleAdminAuditExport(req,res)) return;
      if (await handleBillingTerms(req,res)) return;
      if (await handlePlatformAiGateway(req,res)) return;
      if (await handleRemoteSupport(req,res)) return;
      if (await handlePlatformControl(req,res)) return;
      if (await handleBillingAccess(req,res)) return;
      if (await handleBillingStatus(req,res)) return;
      if (appMode!=='ai' && await handleFiskalyTest(req,res)) return;
      if (await handleTseRoutes(req,res)) return;
      if (await shopRegistrationRuntime.handle(req,res)) return;
      if (await documentsRuntime.handle(req,res)) return;
      if (await shopRuntime.handle(req,res)) return;
      if (await sellerRuntime.handle(req,res)) return;
      if (await marketplaceRuntime.handle(req,res)) return;
      if (await shopAssistant.handle(req,res)) return;
      if (await handleTableSettlement(req,res)) return;
      if (await handlePaymentCheckout(req,res)) return;
      if (await handlePaymentReceipt(req,res)) return;
      if (await handlePublicReceipt(req,res)) return;
      if (await handleRestaurantOwnerFeature(req,res)) return;
    } catch (error) {
      const inputError=clientInputError(error);
      if(inputError&&!res.headersSent){res.writeHead(inputError.status,{'content-type':'application/json','cache-control':'no-store',...(inputError.status===413?{connection:'close'}:{})});return res.end(JSON.stringify({error:inputError.error}));}
      console.error("Modular feature error:", error.code||error.name);
      if (!res.headersSent && error.code==='P0001') {res.writeHead(409,{'content-type':'application/json','cache-control':'no-store'});return res.end(JSON.stringify({error:error.message}))}
      if (!res.headersSent) {
        res.writeHead(500, {"content-type":"application/json","cache-control":"no-store"});
        return res.end(JSON.stringify({error:"Serverfehler"}));
      }
      return res.end();
    }
    return listener(req,res);
  });
};

const originalCreateReadStream = fs.createReadStream.bind(fs);
fs.createReadStream = function patchedCreateReadStream(filePath, options) {
  const normalized = String(filePath).replaceAll("\\", "/");
  if (normalized.includes("/apps/web/public/") && normalized.endsWith(".html")) {
    try {
      let html = fs.readFileSync(filePath, "utf8");
      if (/\/(admin|pos|service|tisch)\/index\.html$/.test(normalized) || normalized.endsWith('/accountant.html')) html=html.replace('</head>','<meta name="robots" content="noindex, nofollow"></head>');
      if (!normalized.includes('/ai') && !normalized.includes('/apps/web/public/shop/') && !html.includes('/brand-logo.js')) html = html.replace("</head>", '<script src="/brand-logo.js"></script></head>');
      if (normalized.endsWith("/apps/web/public/pos/index.html")) {
        if (!html.includes('/pos/numpad.js')) html = html.replace("</body>", '<script src="/pos/numpad.js"></script></body>');
        if (!html.includes('/pos/settlement-flow.js')) html = html.replace("</body>", '<script src="/pos/settlement-flow.js?v=checkout-recovery-20261017"></script></body>');
        if (!html.includes('/pos/payment-flow.js')) html = html.replace("</body>", '<script src="/pos/payment-flow.js?v=checkout-recovery-20261017"></script></body>');
        if (!html.includes('/pos/tax-export.js')) html = html.replace("</body>", '<script src="/pos/tax-export.js?v=time24-complete-20261021"></script></body>');
        if (!html.includes('/pos/availability.js')) html = html.replace("</body>", '<script src="/pos/availability.js?v=time24-development-20261021"></script></body>');
        if (!html.includes('/pos/restaurant-owner.js')) html = html.replace("</body>", '<script src="/pos/restaurant-owner.js?v=variant-adjacent-20261023"></script></body>');
        if (!html.includes('/personnel-report.js')) html = html.replace("</body>", '<script src="/personnel-report.js?v=20261012"></script></body>');
        if (!html.includes('/pos/ean-scanner.js')) html = html.replace('</body>', '<script src="/pos/ean-scanner.js?v=nav-pin-20261020"></script></body>');
        if (!html.includes('/pos/duty-planning.js')) html = html.replace('</body>', '<script src="/pos/duty-planning.js?v=time24-validation-20261021"></script></body>');
        if (!html.includes('/pos/personnel.js')) html = html.replace("</body>", '<script src="/pos/personnel.js"></script></body>');
        if (!html.includes('/pos/desktop-profile.js')) html = html.replace("</body>", '<script src="/pos/desktop-profile.js"></script></body>');
      }
      if (normalized.endsWith("/apps/web/public/tisch/index.html")) {
        if (!html.includes('/tisch/push.js')) html = html.replace('</body>', '<script src="/tisch/push.js"></script></body>');
        if (!html.includes("/tisch/collection.js")) html = html.replace("</body>", '<script src="/tisch/collection.js"></script></body>');
        if (!html.includes('/tisch/guest-enhancements.js')) html = html.replace("</body>", '<script src="/tisch/guest-enhancements.js"></script></body>');
      }
      if (normalized.endsWith("/apps/web/public/service/index.html")) {
        if (!html.includes('/service/duty-planning.js')) html = html.replace('</body>', '<script src="/service/duty-planning.js?v=time24-validation-20261021"></script></body>');
        if (!html.includes('/service/presence.js')) html = html.replace("</body>", '<script src="/service/presence.js?v=time24-complete-20261021"></script></body>');
      }
      if (normalized.endsWith("/apps/web/public/admin/index.html")) {
        if (!html.includes('/admin/support-center.js')) html = html.replace("</body>", '<script src="/admin/support-center.js?v=time24-complete-20261021"></script></body>');
        if (!html.includes('/admin/remote-support.js')) html = html.replace("</body>", '<script src="/admin/remote-support.js?v=time24-complete-20261021"></script></body>');
        if (!html.includes('/admin/platform-hub.js')) html = html.replace("</body>", '<script src="/admin/platform-hub.js"></script></body>');
        if (!html.includes('/admin/control-center.js')) html = html.replace("</body>", '<script src="/admin/control-center.js?v=time24-complete-20261021"></script></body>');
      }
      return Readable.from([Buffer.from(html, "utf8")]);
    } catch (error) {
      console.error("Could not inject web helper modules:", error);
    }
  }
  return originalCreateReadStream(filePath, options);
};

await import("./index.js");
ensureLanguageDatabase().catch(error=>console.error("Language database startup:",error.code||error.name));

async function migrateWithRetry(){
  for(let attempt=1;attempt<=12;attempt++){
    try{
      await migrateRestaurantOwnerFeatures();
      await migratePosEan(platformGatewayPool);
      await migrateDutyPlanning(platformGatewayPool);
      await migrateWaiterDelivery(platformGatewayPool);
      await migratePersonnel(platformGatewayPool);
      await migrateWaiterWorkflow(platformGatewayPool);
      await migrateDisplays(platformGatewayPool);
      await migrateQrService();
      await migratePosStockEvents();
      await migrateCenter();
      await migratePublicReceipts();
      await migrateTseIntegration();
      await migrateFiskalyTest(platformGatewayPool);
      await migrateFiskalySandbox(platformGatewayPool);
      await migrateBillingAccess();
      await migrateDeviceLicense();
      await migrateRemoteSupport(platformGatewayPool);
      setInterval(()=>cleanupRemoteSupport(platformGatewayPool).catch(()=>{}),30000).unref();
      await migrateOfflineSales();
      await migrateAccountantAccess();
      await migrateBillingTerms();
      await migrateTransactionalMail(platformGatewayPool);
      await migratePaymentCheckout(platformGatewayPool);
      await migrateTableSettlement(platformGatewayPool);
      await migrateBillingMail(platformGatewayPool);
      await migrateMerchantCustomerNumbers(platformGatewayPool);
      await migrateStaffInvitations();
      try{await documentsRuntime.migrate();}catch{console.error('Private document migrations unavailable; uploads remain closed.');}
      try{await shopRuntime.migrate();}catch{console.error('Shop migrations unavailable; shop routes remain closed.');}
      try{await shopAssistant.migrate();}catch{console.error('Shop assistant unavailable; guided help remains available.');}
      try{await sellerRuntime.migrate();}catch{console.error('Seller draft migrations unavailable; seller routes remain closed.');}
      try{await marketplaceRuntime.migrate();if(marketHost.schedulerEnabled&&!marketScheduler)marketScheduler=marketplaceRuntime.startReconciliation({onResult:r=>{if(!r.ok||r.failed)console.error('Marketplace test reconciliation needs review.');}});}catch{console.error('Marketplace migrations unavailable; marketplace routes remain closed.');}
      try{await shopRegistrationRuntime.migrate();}catch{console.error('Shop registration migrations unavailable; registration remains closed.');}
      if(appMode!=='ai'&&!isolatedPreview()){const billing=createBillingMail(platformGatewayPool);const deliver=createMailWorker(platformGatewayPool,{renderReceipt:renderMailReceipt,resolveBilling:billing.resolve});setInterval(()=>billing.tick().catch(()=>console.error('Billing mail check unavailable')).then(()=>deliver()).catch(()=>console.error('Transactional mail worker unavailable')),15000).unref();}
      await migrateSupport();
      if (aiFeatures) await aiFeatures.migrateAiPlatform();
      const pricingPool = new pg.Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
      });
      try {
        await pricingPool.query("UPDATE billing_plans SET amount_cents=39900,currency='EUR' WHERE code='download_license'");
      } finally {
        await pricingPool.end();
      }
      console.log("Restaurant-owner, TSE, billing access, device-license schema and download pricing ready.");
      return;
    }
    catch(error){
      if(attempt===12){console.error("Startup feature migration failed:",error);return}
      await new Promise(r=>setTimeout(r,1000));
    }
  }
}
migrateWithRetry().then(()=>{
 if(appMode!=='ai'&&!isolatedPreview()){const deliver=createWaiterDelivery(platformGatewayPool);setInterval(()=>deliver().catch(()=>console.error('Waiter delivery unavailable')),3000).unref();const tick=createSandboxWorker(platformGatewayPool);tick().catch(()=>console.error('Fiskaly TEST worker unavailable'));setInterval(()=>tick().catch(()=>console.error('Fiskaly TEST worker unavailable')),15000).unref();}
});

const availabilityPool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
});

function berlinClock() {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23"
  }).formatToParts(new Date()).filter(p => p.type !== "literal").map(p => [p.type, p.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, monthDay: `${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

function ruleActive(rule) {
  if (!rule?.enabled) return null;
  const now = berlinClock();
  let timeOk = true, seasonOk = true;
  if (rule.startTime && rule.endTime) timeOk = rule.startTime <= rule.endTime ? (now.time >= rule.startTime && now.time <= rule.endTime) : (now.time >= rule.startTime || now.time <= rule.endTime);
  else if (rule.startTime) timeOk = now.time >= rule.startTime;
  else if (rule.endTime) timeOk = now.time <= rule.endTime;
  const start = String(rule.startDate || "").slice(5), end = String(rule.endDate || "").slice(5);
  if (start && end) seasonOk = start <= end ? (now.monthDay >= start && now.monthDay <= end) : (now.monthDay >= start || now.monthDay <= end);
  else if (start) seasonOk = now.monthDay >= start;
  else if (end) seasonOk = now.monthDay <= end;
  return timeOk && seasonOk;
}

async function applyAvailabilityRules() {
  try {
    const q = await availabilityPool.query("SELECT p.id,pt.allergens FROM products p JOIN product_translations pt ON pt.product_id=p.id WHERE pt.language_code='avl' AND pt.allergens IS NOT NULL");
    for (const row of q.rows) {
      let rule; try { rule = JSON.parse(row.allergens); } catch { continue; }
      const active = ruleActive(rule); if (active === null) continue;
      await availabilityPool.query("UPDATE products SET active=$2 WHERE id=$1 AND active IS DISTINCT FROM $2", [row.id, active]);
    }
  } catch (error) {
    console.error("Availability scheduler failed:", error.message);
  }
}
setTimeout(applyAvailabilityRules, 3000);
setInterval(applyAvailabilityRules, 60000).unref();




